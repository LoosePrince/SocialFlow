import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { LsqliteHttpClient } from './lsqliteClient.js';
import type { AppSql } from './dbTypes.js';

type SourceRow = Record<string, unknown>;

type TablePlan = {
  name: string;
  conflict: string[];
  orderBy?: string;
};

const tablePlans: TablePlan[] = [
  { name: 'profiles', conflict: ['id'], orderBy: 'createdat ASC' },
  { name: 'posts', conflict: ['id'], orderBy: 'createdat ASC' },
  { name: 'projects', conflict: ['id'], orderBy: 'createdat ASC' },
  { name: 'file_folders', conflict: ['id'], orderBy: 'createdat ASC' },
  { name: 'file_assets', conflict: ['id'], orderBy: 'createdat ASC' },
  { name: 'post_attachments', conflict: ['postid', 'assetid'], orderBy: 'sortorder ASC, createdat ASC' },
  { name: 'project_attachments', conflict: ['projectid', 'assetid'], orderBy: 'sortorder ASC, createdat ASC' },
  { name: 'likes', conflict: ['id'], orderBy: 'createdat ASC' },
  { name: 'comments', conflict: ['id'], orderBy: 'createdat ASC' },
  { name: 'notifications', conflict: ['id'], orderBy: 'createdat ASC' },
  { name: 'notification_settings', conflict: ['userid'] },
  { name: 'push_subscriptions', conflict: ['endpoint'], orderBy: 'createdat ASC' },
  { name: 'site_settings', conflict: ['key'] },
];

const sqliteJsonColumns = new Set(['images', 'attachments', 'mentionids', 'payload', 'value']);
const sqliteBooleanColumns = new Set([
  'isrecommended',
  'isread',
  'isalert',
  'receive_recommend',
  'alert_recommend',
  'receive_like',
  'alert_like',
  'receive_comment',
  'alert_comment',
  'receive_reply',
  'alert_reply',
  'receive_delete',
  'alert_delete',
  'receive_mention',
  'alert_mention',
]);

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

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function migrationsDir(): string {
  const besideModule = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations-lsqlite');
  if (existsSync(besideModule)) return besideModule;
  return path.join(process.cwd(), 'server', 'migrations-lsqlite');
}

function normalizeForSqlite(column: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.getTime();
  if (sqliteBooleanColumns.has(column)) return value ? 1 : 0;
  if (sqliteJsonColumns.has(column)) {
    if (value === null) return column === 'value' || column === 'payload' ? '{}' : '[]';
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function ensureLsqliteSchema(sql: AppSql): Promise<void> {
  console.log('[migrate] 正在初始化 Lsqlite 结构…');
  const dir = migrationsDir();
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error(`[migrate] 未找到 Lsqlite 迁移脚本: ${dir}`);

  for (const file of files) {
    await sql.file(path.join(dir, file));
    await sql`
      INSERT INTO app_schema_migrations (version, applied_at)
      VALUES (${file}, ${Date.now()})
      ON CONFLICT (version) DO NOTHING
    `;
    console.log(`[migrate] 结构脚本已确认: ${file}`);
  }
}

async function sourceTableExists(source: postgres.Sql, table: string): Promise<boolean> {
  const rows = await source`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS present
  `;
  return Boolean((rows[0] as { present?: boolean } | undefined)?.present);
}

async function sourceColumns(source: postgres.Sql, table: string): Promise<string[]> {
  const rows = await source`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position ASC
  `;
  return (rows as unknown as Array<{ column_name: string }>).map((row) => row.column_name);
}

async function targetColumns(target: AppSql, table: string): Promise<string[]> {
  const rows = await target.unsafe(`PRAGMA table_info(${quoteIdent(table)})`);
  return (rows as unknown as Array<{ name?: string }>).map((row) => row.name ?? '').filter(Boolean);
}

function orderByAvailable(orderBy: string | undefined, columns: string[]): string | undefined {
  if (!orderBy) return undefined;
  const columnSet = new Set(columns);
  const referenced = orderBy
    .split(',')
    .map((part) => part.trim().split(/\s+/, 1)[0]?.replace(/^"|"$/g, '') ?? '')
    .filter(Boolean);
  return referenced.every((column) => columnSet.has(column)) ? orderBy : undefined;
}

function buildUpsert(table: string, columns: string[], conflict: string[]): string {
  const updateColumns = columns.filter((column) => !conflict.includes(column));
  const insertColumns = columns.map(quoteIdent).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const conflictTarget = conflict.map(quoteIdent).join(', ');
  if (updateColumns.length === 0) {
    return `INSERT INTO ${quoteIdent(table)} (${insertColumns}) VALUES (${placeholders}) ON CONFLICT (${conflictTarget}) DO NOTHING`;
  }
  const assignments = updateColumns
    .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
    .join(', ');
  return `INSERT INTO ${quoteIdent(table)} (${insertColumns}) VALUES (${placeholders}) ON CONFLICT (${conflictTarget}) DO UPDATE SET ${assignments}`;
}

async function readSourceRows(source: postgres.Sql, table: string, orderBy?: string): Promise<SourceRow[]> {
  const sqlText = `SELECT * FROM public.${quoteIdent(table)}${orderBy ? ` ORDER BY ${orderBy}` : ''}`;
  return (await source.unsafe(sqlText)) as SourceRow[];
}

async function clearTargetTables(sql: AppSql): Promise<void> {
  console.warn('[migrate] LSQLITE_MIGRATION_CLEAR=1，正在清空目标业务表…');
  for (const plan of [...tablePlans].reverse()) {
    await sql.unsafe(`DELETE FROM ${quoteIdent(plan.name)}`);
  }
}

async function migrateTable(
  source: postgres.Sql,
  targetSql: AppSql,
  targetClient: LsqliteHttpClient,
  plan: TablePlan
): Promise<number> {
  if (!(await sourceTableExists(source, plan.name))) {
    console.warn(`[migrate] 源表不存在，跳过: ${plan.name}`);
    return 0;
  }

  const sourceColumnList = await sourceColumns(source, plan.name);
  if (sourceColumnList.length === 0) {
    console.warn(`[migrate] 源表无字段，跳过: ${plan.name}`);
    return 0;
  }

  const targetColumnList = await targetColumns(targetSql, plan.name);
  const targetColumnSet = new Set(targetColumnList);
  const columns = sourceColumnList.filter((column) => targetColumnSet.has(column));
  if (columns.length === 0) {
    console.warn(`[migrate] 源表与目标表没有共同字段，跳过: ${plan.name}`);
    return 0;
  }
  const missingConflicts = plan.conflict.filter((column) => !columns.includes(column));
  if (missingConflicts.length > 0) {
    console.warn(`[migrate] 目标冲突键缺失，跳过: ${plan.name} (${missingConflicts.join(', ')})`);
    return 0;
  }

  const skippedColumns = sourceColumnList.filter((column) => !targetColumnSet.has(column));
  if (skippedColumns.length > 0) {
    console.warn(`[migrate] ${plan.name}: 跳过目标不存在字段 ${skippedColumns.join(', ')}`);
  }

  const rows = await readSourceRows(source, plan.name, orderByAvailable(plan.orderBy, sourceColumnList));
  if (rows.length === 0) {
    console.log(`[migrate] ${plan.name}: 0 行`);
    return 0;
  }

  const sqlText = buildUpsert(plan.name, columns, plan.conflict);
  const batchSize = 50;
  let written = 0;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const statements = batch.map((row) => ({
      sql: sqlText,
      params: columns.map((column) => normalizeForSqlite(column, row[column])),
      mode: 'write' as const,
    }));
    await targetClient.transaction(statements);
    written += batch.length;
    console.log(`[migrate] ${plan.name}: ${Math.min(written, rows.length)}/${rows.length}`);
  }
  return written;
}

async function main(): Promise<void> {
  const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim() || requireEnv('DATABASE_URL');
  const targetClient = new LsqliteHttpClient({
    baseUrl: requireAnyEnv(['LSQLITE_BASE_URL', 'LSQLITE_URL']),
    databaseKey: requireAnyEnv(['LSQLITE_DATABASE_KEY', 'LSQLITE_KEY']),
  });
  const targetSql = targetClient.createSql();
  await targetClient.health();
  await ensureLsqliteSchema(targetSql);

  const source = postgres(sourceUrl, {
    ssl: 'require',
    max: 1,
    idle_timeout: 10,
  });

  try {
    if (process.env.LSQLITE_MIGRATION_CLEAR === '1' || process.env.LSQLITE_MIGRATION_CLEAR === 'true') {
      await clearTargetTables(targetSql);
    }

    let total = 0;
    for (const plan of tablePlans) {
      total += await migrateTable(source, targetSql, targetClient, plan);
    }
    console.log(`[migrate] 完成，累计写入/覆盖 ${total} 行`);
  } finally {
    await source.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('[migrate] 失败:', err);
  process.exit(1);
});