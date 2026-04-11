import { supabase } from '../supabase';

const base = () => import.meta.env.VITE_API_URL ?? '';

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base()}${p}`;
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

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || res.statusText || String(res.status));
  }
  return res.json() as Promise<T>;
}

/** 媒体上传（后端转存 GitHub） */
export async function uploadMedia(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch('/api/uploads', { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Upload failed');
  }
  const data = (await res.json()) as { path: string };
  return data.path;
}
