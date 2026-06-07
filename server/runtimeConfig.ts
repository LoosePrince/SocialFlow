import { sql } from './db.js';

export const runtimeConfigKeys = [
  'ADMIN_EMAIL',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_JWT_ISSUER',
  'SUPABASE_JWT_AUD',
  'SUPABASE_JWT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GITHUB_TOKEN',
  'GITHUB_USER',
  'GITHUB_REPO',
  'GITHUB_UPLOAD_PATH',
  'GITHUB_EMAIL',
  'VITE_GITHUB_USER',
  'VITE_GITHUB_REPO',
  'VITE_GITHUB_UPLOAD_PATH',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'SKIP_COUNT_RECONCILE',
  'COUNT_RECONCILE_INTERVAL_MS',
] as const;

export type RuntimeConfigKey = (typeof runtimeConfigKeys)[number];
const runtimeConfigKeySet = new Set<string>(runtimeConfigKeys);

export const envOnlyConfigKeys = ['FRONTEND_ORIGIN', 'VITE_API_URL'] as const;
const envOnlyConfigKeySet = new Set<string>(envOnlyConfigKeys);

type SettingRow = {
  key: string;
  value: unknown;
  updatedby?: string | null;
};

type ConfigEntry = {
  value: unknown;
  isEnvDefault: boolean;
};

let warnedSettingsTableMissing = false;

function unwrapSettingValue(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, 'value')
  ) {
    return (value as { value?: unknown }).value;
  }
  return value;
}

export function normalizeConfigString(value: string): string {
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

export function normalizeRuntimeConfigValue(value: unknown): unknown {
  const unwrapped = unwrapSettingValue(value);
  if (typeof unwrapped === 'string') return normalizeConfigString(unwrapped);
  if (Array.isArray(unwrapped)) {
    return unwrapped.map((item) =>
      typeof item === 'string' ? normalizeConfigString(item) : item
    );
  }
  return unwrapped;
}

function rawToString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return normalizeConfigString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

function hasEnvValue(key: string): boolean {
  return process.env[key] !== undefined;
}

export function isRuntimeConfigKey(key: string): key is RuntimeConfigKey {
  return runtimeConfigKeySet.has(key);
}

export function isEnvOnlyConfigKey(key: string): boolean {
  return envOnlyConfigKeySet.has(key);
}

export function getEnvOnlyConfigStringList(
  key: (typeof envOnlyConfigKeys)[number],
  defaultValue: string[] = []
): string[] {
  const raw = process.env[key] === undefined ? undefined : normalizeConfigString(process.env[key] ?? '');
  if (raw === undefined || raw.trim() === '') return defaultValue;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Comma-separated values are the common environment format.
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function insertEnvDefaultIfMissing(key: string): Promise<void> {
  if (!runtimeConfigKeySet.has(key) || !hasEnvValue(key)) return;
  const value = normalizeConfigString(process.env[key] ?? '');
  await sql`
    INSERT INTO site_settings (key, value, updatedat, updatedby)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${Date.now()}, null)
    ON CONFLICT (key) DO NOTHING
  `;
}

async function getDatabaseConfigMap(keys: readonly string[]): Promise<Map<string, ConfigEntry>> {
  if (keys.length === 0) return new Map();
  let rows: SettingRow[];
  try {
    rows = (await sql`
      SELECT key, value, updatedby
      FROM site_settings
      WHERE key = ANY(${sql.array([...keys])})
    `) as SettingRow[];
  } catch (err) {
    const code =
      typeof err === 'object' && err && 'code' in err
        ? (err as { code?: string }).code
        : undefined;
    if (code === '42P01') {
      if (!warnedSettingsTableMissing) {
        console.warn('[config] site_settings table is missing; falling back to environment variables');
        warnedSettingsTableMissing = true;
      }
      return new Map();
    }
    throw err;
  }
  const map = new Map<string, ConfigEntry>();
  for (const row of rows) {
    const value = normalizeRuntimeConfigValue(row.value);
    const envValue = hasEnvValue(row.key)
      ? normalizeConfigString(process.env[row.key] ?? '')
      : undefined;
    map.set(row.key, {
      value,
      isEnvDefault:
        row.updatedby == null &&
        envValue !== undefined &&
        rawToString(value) === envValue,
    });
  }
  return map;
}

export async function getRuntimeConfigRaw(key: RuntimeConfigKey): Promise<unknown | undefined> {
  const map = await getDatabaseConfigMap([key]);
  const entry = map.get(key);
  if (entry) return entry.value;
  if (!hasEnvValue(key)) return undefined;
  await insertEnvDefaultIfMissing(key);
  return process.env[key];
}

export async function getRuntimeConfigValue(
  key: RuntimeConfigKey,
  defaultValue?: string
): Promise<string | undefined> {
  const value = rawToString(await getRuntimeConfigRaw(key));
  return value === undefined ? defaultValue : value;
}

export async function getFirstRuntimeConfigValue(
  keys: readonly RuntimeConfigKey[],
  defaultValue?: string
): Promise<string | undefined> {
  const map = await getDatabaseConfigMap(keys);
  for (const key of keys) {
    const entry = map.get(key);
    if (entry && !entry.isEnvDefault) return rawToString(entry.value);
  }
  for (const key of keys) {
    const entry = map.get(key);
    if (entry) return rawToString(entry.value);
  }
  for (const key of keys) {
    if (hasEnvValue(key)) {
      await insertEnvDefaultIfMissing(key);
      return process.env[key];
    }
  }
  return defaultValue;
}

export async function getRuntimeConfigBool(
  key: RuntimeConfigKey,
  defaultValue = false
): Promise<boolean> {
  const value = await getRuntimeConfigValue(key);
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export async function getRuntimeConfigNumber(
  key: RuntimeConfigKey,
  defaultValue: number
): Promise<number> {
  const value = await getRuntimeConfigValue(key);
  if (value === undefined || value.trim() === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export async function getRuntimeConfigStringList(
  key: RuntimeConfigKey,
  defaultValue: string[] = []
): Promise<string[]> {
  const raw = await getRuntimeConfigRaw(key);
  if (raw === undefined || raw === null) return defaultValue;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  const value = rawToString(raw);
  if (value === undefined) return defaultValue;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function getSupabaseProjectUrl(): Promise<string> {
  const value = await getFirstRuntimeConfigValue(['SUPABASE_URL', 'VITE_SUPABASE_URL'], '');
  return (value ?? '').replace(/\/$/, '');
}

export async function getPublicRuntimeConfig() {
  const [
    supabaseUrl,
    supabaseAnonKey,
    githubUser,
    githubRepo,
    githubUploadPath,
  ] = await Promise.all([
    getFirstRuntimeConfigValue(['SUPABASE_URL', 'VITE_SUPABASE_URL'], ''),
    getRuntimeConfigValue('VITE_SUPABASE_PUBLISHABLE_KEY', ''),
    getFirstRuntimeConfigValue(['GITHUB_USER', 'VITE_GITHUB_USER'], ''),
    getFirstRuntimeConfigValue(['GITHUB_REPO', 'VITE_GITHUB_REPO'], ''),
    getFirstRuntimeConfigValue(['GITHUB_UPLOAD_PATH', 'VITE_GITHUB_UPLOAD_PATH'], 'SocialFlow/'),
  ]);

  return {
    VITE_SUPABASE_URL: supabaseUrl ?? '',
    VITE_SUPABASE_PUBLISHABLE_KEY: supabaseAnonKey ?? '',
    VITE_GITHUB_USER: githubUser ?? '',
    VITE_GITHUB_REPO: githubRepo ?? '',
    VITE_GITHUB_UPLOAD_PATH: githubUploadPath ?? '',
  };
}

export async function syncEnvConfigDefaultsToDatabase(): Promise<number> {
  const entries = runtimeConfigKeys
    .map((key) => [
      key,
      process.env[key] === undefined ? undefined : normalizeConfigString(process.env[key] ?? ''),
    ] as const)
    .filter((entry): entry is readonly [RuntimeConfigKey, string] => entry[1] !== undefined);

  let inserted = 0;
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM site_settings
      WHERE key = ANY(${sql.array([...envOnlyConfigKeys])})
    `;
    for (const [key, value] of entries) {
      const rows = await tx`
        INSERT INTO site_settings (key, value, updatedat, updatedby)
        VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${Date.now()}, null)
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      `;
      inserted += rows.length;
    }
  });
  return inserted;
}
