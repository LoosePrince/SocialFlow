import postgres from 'postgres';
import { LsqliteHttpClient } from './lsqliteClient.js';
import type { AppSql } from './dbTypes.js';

type DatabaseProvider = 'postgres' | 'lsqlite';

function parseDatabaseProvider(): DatabaseProvider {
  const raw = (process.env.DATABASE_PROVIDER ?? process.env.DB_PROVIDER ?? 'postgres').trim().toLowerCase();
  if (raw === 'lsqlite' || raw === 'sqlite') return 'lsqlite';
  return 'postgres';
}

export const databaseProvider = parseDatabaseProvider();

function firstEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function requireAnyEnv(names: readonly string[]): string {
  const value = firstEnv(names);
  if (!value) throw new Error(`${names.join(' / ')} is required`);
  return value;
}

function requireEnv(name: string): string {
  return requireAnyEnv([name]);
}

function parseConnectionMax() {
  const raw = process.env.DATABASE_MAX_CONNECTIONS ?? process.env.DB_MAX_CONNECTIONS;
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return databaseProvider === 'lsqlite' ? 1 : 5;
  return Math.min(parsed, 20);
}

export const databaseMaxConnections = parseConnectionMax();

function createPostgresSql() {
  const databaseUrl = requireEnv('DATABASE_URL');
  return postgres(databaseUrl, {
    ssl: 'require',
    max: databaseMaxConnections,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });
}

function createPostgresListenSql() {
  return postgres(requireEnv('DATABASE_URL'), {
    ssl: 'require',
    max: 1,
  });
}

function createLsqliteSql() {
  const client = new LsqliteHttpClient({
    baseUrl: requireAnyEnv(['LSQLITE_BASE_URL', 'LSQLITE_URL']),
    databaseKey: requireAnyEnv(['LSQLITE_DATABASE_KEY', 'LSQLITE_KEY']),
  });
  return client.createSql();
}

const postgresSql = databaseProvider === 'postgres' ? createPostgresSql() : null;
const postgresListenSql = databaseProvider === 'postgres' ? createPostgresListenSql() : null;

export const sql: AppSql =
  databaseProvider === 'postgres'
    ? (postgresSql as unknown as AppSql)
    : createLsqliteSql();

/** 独立连接，仅用于 PostgreSQL LISTEN；Lsqlite 下为 no-op。 */
export const listenSql: AppSql =
  databaseProvider === 'postgres'
    ? (postgresListenSql as unknown as AppSql)
    : sql;

let closing = false;
export async function closeDatabaseConnections() {
  if (closing) return;
  closing = true;
  await Promise.allSettled([
    postgresSql?.end({ timeout: 5 }),
    postgresListenSql?.end({ timeout: 5 }),
  ]);
}

export { type AppSql } from './dbTypes.js';
