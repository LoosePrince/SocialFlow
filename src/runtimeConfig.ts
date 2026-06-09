export type PublicRuntimeConfig = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
  VITE_GITHUB_USER: string;
  VITE_GITHUB_REPO: string;
  VITE_GITHUB_UPLOAD_PATH: string;
  VITE_API_URL: string;
};

const fallbackConfig: PublicRuntimeConfig = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ?? '',
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  VITE_GITHUB_USER: import.meta.env.VITE_GITHUB_USER ?? '',
  VITE_GITHUB_REPO: import.meta.env.VITE_GITHUB_REPO ?? '',
  VITE_GITHUB_UPLOAD_PATH: import.meta.env.VITE_GITHUB_UPLOAD_PATH ?? '',
  VITE_API_URL: import.meta.env.VITE_API_URL ?? '',
};
const CONFIG_CACHE_KEY = 'socialflow.runtime-config.v1';

let runtimeConfig: PublicRuntimeConfig = mergePublicConfig(fallbackConfig);
let loadPromise: Promise<PublicRuntimeConfig> | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeConfigString(value: string): string {
  let current = value.trim();
  for (let index = 0; index < 3; index += 1) {
    if (current.startsWith('"') && current.endsWith('"')) {
      try {
        const parsed = JSON.parse(current) as unknown;
        if (typeof parsed !== 'string') break;
        current = parsed.trim();
        continue;
      } catch {
        break;
      }
    }
    if (current.startsWith("'") && current.endsWith("'")) {
      current = current.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return current;
}

function normalizeApiUrl(value: string): string {
  const current = normalizeConfigString(value);
  if (!current) return '';
  if (/^https?:\/\//i.test(current)) return current.replace(/\/$/, '');
  return `https://${current.replace(/^\/+/, '').replace(/\/$/, '')}`;
}

function normalizePublicConfig(config: Partial<PublicRuntimeConfig>): Partial<PublicRuntimeConfig> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => {
      const normalized =
        typeof value === 'string'
          ? key === 'VITE_API_URL'
            ? normalizeApiUrl(value)
            : normalizeConfigString(value)
          : value;
      return [key, normalized];
    })
  ) as Partial<PublicRuntimeConfig>;
}

function requiredConfigErrors(config: PublicRuntimeConfig): string[] {
  const errors: string[] = [];
  if (!isHttpUrl(config.VITE_SUPABASE_URL)) {
    errors.push('VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL');
  }
  if (!config.VITE_SUPABASE_PUBLISHABLE_KEY.trim()) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is required');
  }
  return errors;
}

function mergePublicConfig(config: Partial<PublicRuntimeConfig>): PublicRuntimeConfig {
  const normalizedFallback = normalizePublicConfig(fallbackConfig);
  const normalizedConfig = normalizePublicConfig(config);
  return {
    VITE_SUPABASE_URL: normalizedConfig.VITE_SUPABASE_URL ?? normalizedFallback.VITE_SUPABASE_URL ?? '',
    VITE_SUPABASE_PUBLISHABLE_KEY:
      normalizedConfig.VITE_SUPABASE_PUBLISHABLE_KEY ??
      normalizedFallback.VITE_SUPABASE_PUBLISHABLE_KEY ??
      '',
    VITE_GITHUB_USER: normalizedConfig.VITE_GITHUB_USER ?? normalizedFallback.VITE_GITHUB_USER ?? '',
    VITE_GITHUB_REPO: normalizedConfig.VITE_GITHUB_REPO ?? normalizedFallback.VITE_GITHUB_REPO ?? '',
    VITE_GITHUB_UPLOAD_PATH:
      normalizedConfig.VITE_GITHUB_UPLOAD_PATH ?? normalizedFallback.VITE_GITHUB_UPLOAD_PATH ?? '',
    VITE_API_URL: normalizedConfig.VITE_API_URL ?? normalizedFallback.VITE_API_URL ?? '',
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getRuntimeConfig(): PublicRuntimeConfig {
  return runtimeConfig;
}

export function getApiBase(): string {
  return runtimeConfig.VITE_API_URL || normalizeApiUrl(fallbackConfig.VITE_API_URL) || '';
}

function hasRequiredBuildConfig(): boolean {
  return requiredConfigErrors(mergePublicConfig(fallbackConfig)).length === 0;
}

async function fetchRemoteRuntimeConfig(): Promise<PublicRuntimeConfig> {
  const base = normalizeApiUrl(fallbackConfig.VITE_API_URL);
  if (!base) {
    throw new Error('VITE_API_URL is required');
  }

  const res = await fetch(`${base}/api/public-config`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`public config failed: ${res.status}`);
  const config = (await res.json()) as Partial<PublicRuntimeConfig>;
  const nextConfig = mergePublicConfig(config);
  const errors = requiredConfigErrors(nextConfig);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  runtimeConfig = nextConfig;
  writeCachedRuntimeConfig(nextConfig);
  return runtimeConfig;
}

function readCachedRuntimeConfig(): PublicRuntimeConfig | null {
  try {
    const raw = window.localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PublicRuntimeConfig>;
    const config = mergePublicConfig(parsed);
    return requiredConfigErrors(config).length > 0 ? null : config;
  } catch {
    return null;
  }
}

function writeCachedRuntimeConfig(config: PublicRuntimeConfig) {
  try {
    window.localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

export async function loadRuntimeConfig(): Promise<PublicRuntimeConfig> {
  if (!loadPromise) {
    loadPromise = (async () => {
      if (hasRequiredBuildConfig()) {
        runtimeConfig = mergePublicConfig(fallbackConfig);
        void fetchRemoteRuntimeConfig().catch((err) => {
          console.warn('[config] background public config refresh failed:', err);
        });
        return runtimeConfig;
      }

      const fallbackErrors = requiredConfigErrors(runtimeConfig);
      const maxAttempts = fallbackErrors.length > 0 ? 30 : 3;
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          return await fetchRemoteRuntimeConfig();
        } catch (err) {
          lastError = err;
          if (attempt < maxAttempts) {
            await delay(Math.min(300 + attempt * 200, 1500));
          }
        }
      }

      const cachedConfig = readCachedRuntimeConfig();
      if (cachedConfig) {
        runtimeConfig = cachedConfig;
        console.warn('[config] using cached runtime config:', lastError);
        return runtimeConfig;
      }

      runtimeConfig = mergePublicConfig(fallbackConfig);
      const errors = requiredConfigErrors(runtimeConfig);
      if (errors.length > 0) {
        throw new Error(
          `Unable to load runtime config. ${errors.join('; ')}. Last fetch error: ${errorMessage(lastError)}`
        );
      }
      console.warn('[config] using build-time fallback config:', lastError);
      return runtimeConfig;
    })();
  }
  return loadPromise;
}
