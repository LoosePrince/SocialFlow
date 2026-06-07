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

let runtimeConfig: PublicRuntimeConfig = { ...fallbackConfig };
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

function normalizePublicConfig(config: Partial<PublicRuntimeConfig>): Partial<PublicRuntimeConfig> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      typeof value === 'string' ? normalizeConfigString(value) : value,
    ])
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
  return {
    ...fallbackConfig,
    ...normalizePublicConfig(config),
    VITE_API_URL: fallbackConfig.VITE_API_URL,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getRuntimeConfig(): PublicRuntimeConfig {
  return runtimeConfig;
}

export function getApiBase(): string {
  return runtimeConfig.VITE_API_URL || fallbackConfig.VITE_API_URL || '';
}

export async function loadRuntimeConfig(): Promise<PublicRuntimeConfig> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const base = fallbackConfig.VITE_API_URL || '';
      const fallbackErrors = requiredConfigErrors(fallbackConfig);
      const maxAttempts = fallbackErrors.length > 0 ? 30 : 3;
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const res = await fetch(`${base}/api/public-config`, { cache: 'no-store' });
          if (!res.ok) throw new Error(`public config failed: ${res.status}`);
          const config = (await res.json()) as Partial<PublicRuntimeConfig>;
          const nextConfig = mergePublicConfig(config);
          const errors = requiredConfigErrors(nextConfig);
          if (errors.length > 0) {
            throw new Error(errors.join('; '));
          }
          runtimeConfig = nextConfig;
          return runtimeConfig;
        } catch (err) {
          lastError = err;
          if (attempt < maxAttempts) {
            await delay(Math.min(300 + attempt * 200, 1500));
          }
        }
      }

      runtimeConfig = { ...fallbackConfig };
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
