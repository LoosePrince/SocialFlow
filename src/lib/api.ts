import { supabase } from '../supabase';
import { getApiBase } from '../runtimeConfig';

const base = () => getApiBase();
const API_CACHE_PREFIX = 'socialflow.api-cache.v1:';
const API_CACHE_EVENT = 'socialflow:api-cache-updated';

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const apiBase = base();
  if (!apiBase) {
    throw new Error('API 地址未配置，请设置 VITE_API_URL');
  }
  return `${apiBase}${p}`;
}

type CachedPayload<T> = {
  savedAt: number;
  data: T;
};

type ApiJsonInit = RequestInit & {
  /** 读接口默认本地优先；设为 false 时强制等待网络。 */
  localFirst?: boolean;
};

type ApiCacheUpdateEvent<T = unknown> = CustomEvent<{
  cacheKey: string;
  path: string;
  data: T;
  savedAt: number;
}>;

function methodOf(init: RequestInit): string {
  return (init.method || 'GET').toUpperCase();
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

async function cacheScope(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || 'anon';
}

async function cacheKeyFor(path: string): Promise<string> {
  return `${API_CACHE_PREFIX}${await cacheScope()}:${apiUrl(path)}`;
}

function readCache<T>(cacheKey: string): CachedPayload<T> | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload<T>;
    if (!parsed || typeof parsed.savedAt !== 'number' || !('data' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache<T>(cacheKey: string, path: string, data: T) {
  if (!canUseLocalStorage()) return;
  const savedAt = Date.now();
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({ savedAt, data }));
    window.dispatchEvent(
      new CustomEvent(API_CACHE_EVENT, {
        detail: { cacheKey, path, data, savedAt },
      })
    );
  } catch (err) {
    console.warn('[api] cache write failed:', err);
  }
}

function clearApiCache() {
  if (!canUseLocalStorage()) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(API_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

export function onApiCacheUpdate<T>(
  path: string,
  handler: (data: T, meta: { savedAt: number }) => void
): () => void {
  const listener = (event: Event) => {
    const detail = (event as ApiCacheUpdateEvent<T>).detail;
    if (!detail || detail.path !== path) return;
    handler(detail.data, { savedAt: detail.savedAt });
  };
  window.addEventListener(API_CACHE_EVENT, listener);
  return () => window.removeEventListener(API_CACHE_EVENT, listener);
}

/** 合并并发 refresh，避免每个 401 都打 /auth/v1/token 导致 429 */
let refreshInFlight: Promise<string | undefined> | null = null;

async function refreshAccessTokenOnce(): Promise<string | undefined> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('[api] refreshSession:', error.message);
        return undefined;
      }
      return data.session?.access_token;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const applyAuth = (accessToken: string | undefined) => {
    const headers = new Headers(init.headers);
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    if (
      init.body !== undefined &&
      typeof init.body === 'string' &&
      !headers.has('Content-Type')
    ) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(apiUrl(path), { ...init, headers });
  };

  let { data: { session } } = await supabase.auth.getSession();
  let res = await applyAuth(session?.access_token);

  // 无 token 的 401 不应触发 refresh（避免无效循环）；有 token 仍 401 时全站共用一个 refresh
  if (res.status === 401 && session?.access_token) {
    const newToken = await refreshAccessTokenOnce();
    if (newToken) {
      res = await applyAuth(newToken);
    }
  }

  return res;
}

/** 读取 API 响应体；非 JSON 时抛出可读错误，避免 SyntaxError 直接暴露给用户 */
export async function parseApiResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T;
  try {
    data = (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(text.trim() || res.statusText || 'Invalid response');
  }
  if (!res.ok) {
    const err = data as { error?: string; msg?: string };
    throw new Error(err.error || err.msg || res.statusText || String(res.status));
  }
  return data;
}

async function apiJsonFromNetwork<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  return parseApiResponse<T>(res);
}

export async function apiJson<T>(path: string, init: ApiJsonInit = {}): Promise<T> {
  const { localFirst = true, ...requestInit } = init;
  const isRead = methodOf(requestInit) === 'GET' && requestInit.body === undefined;

  if (!isRead) {
    const data = await apiJsonFromNetwork<T>(path, requestInit);
    clearApiCache();
    return data;
  }

  const cacheKey = await cacheKeyFor(path);
  const cached = localFirst ? readCache<T>(cacheKey) : null;

  if (cached) {
    void apiJsonFromNetwork<T>(path, { ...requestInit, cache: 'no-store' })
      .then((fresh) => writeCache(cacheKey, path, fresh))
      .catch((err) => console.debug('[api] background refresh failed:', err));
    return cached.data;
  }

  const fresh = await apiJsonFromNetwork<T>(path, { ...requestInit, cache: 'no-store' });
  writeCache(cacheKey, path, fresh);
  return fresh;
}

export type UploadScope = 'post' | 'project' | 'profile';

/** 媒体上传（后端转存 GitHub，路径规范见服务端 githubUpload） */
export async function uploadMedia(
  file: File,
  options: { scope: UploadScope; contentId: string }
): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('scope', options.scope);
  fd.append('contentId', options.contentId);
  const res = await apiFetch('/api/uploads', { method: 'POST', body: fd });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Upload failed');
  }
  const data = (await res.json()) as { path: string };
  return data.path;
}
