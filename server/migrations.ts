import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseProvider, type AppSql } from './db.js';

/** 优先使用与当前模块同目录的 migrations；Lsqlite 使用单独的 SQLite 迁移目录。 */
export function migrationsDir(): string {
  const dirName = databaseProvider === 'lsqlite' ? 'migrations-lsqlite' : 'migrations';
  const besideModule = path.join(path.dirname(fileURLToPath(import.meta.url)), dirName);
  if (existsSync(besideModule)) return besideModule;
  return path.join(process.cwd(), 'server', dirName);
}

/** 连接与基本可读性检查；失败时抛出，供启动流程中止。 */
export async function checkDatabase(sql: AppSql): Promise<void> {
  console.log('[db] 正在检查数据库连接…');
  try {
    if (databaseProvider === 'lsqlite') {
      const rows = await sql`
        SELECT sqlite_version() AS sqlite_version
      `;
      const row = rows[0] as { sqlite_version?: string } | undefined;
      console.log('[db] Lsqlite 连接成功');
      console.log(`[db]   · SQLite ${row?.sqlite_version ?? 'unknown'}`);
      return;
    }

    const rows = await sql`
      SELECT current_database() AS db, version() AS pg_version
    `;
    const row = rows[0] as { db: string; pg_version: string };
    const verLine = row.pg_version.split('\n')[0].trim();
    console.log('[db] PostgreSQL 连接成功');
    console.log(`[db]   · 当前数据库: ${row.db}`);
    console.log(`[db]   · ${verLine}`);
  } catch (err) {
    console.error('[db] 数据库连接失败，请检查 DATABASE_PROVIDER、DATABASE_URL / LSQLITE_BASE_URL / LSQLITE_DATABASE_KEY 与网络是否可用。');
    throw err;
  }
}

async function tableExists(sql: AppSql, tableName: string): Promise<boolean> {
  if (databaseProvider === 'lsqlite') {
    const rows = await sql`
      SELECT EXISTS (
        SELECT 1 FROM sqlite_schema
        WHERE type = 'table' AND name = ${tableName}
      ) AS present
    `;
    return Boolean((rows[0] as { present?: unknown } | undefined)?.present);
  }

  const rows = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS present
  `;
  return Boolean((rows[0] as { present?: unknown } | undefined)?.present);
}

async function createMigrationsTable(sql: AppSql): Promise<void> {
  if (databaseProvider === 'lsqlite') {
    await sql`
      CREATE TABLE app_schema_migrations (
        version text PRIMARY KEY,
        applied_at bigint NOT NULL DEFAULT 0
      )
    `;
    return;
  }

  await sql`
    CREATE TABLE app_schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function recordMigration(tx: AppSql, version: string): Promise<void> {
  if (databaseProvider === 'lsqlite') {
    await tx`
      INSERT INTO app_schema_migrations (version, applied_at)
      VALUES (${version}, ${Date.now()})
      ON CONFLICT (version) DO NOTHING
    `;
    return;
  }

  await tx`
    INSERT INTO app_schema_migrations (version)
    VALUES (${version})
    ON CONFLICT (version) DO NOTHING
  `;
}

/** 迁移应用后核对核心业务表是否存在（仅作提示，不替代迁移失败时的 SQL 报错）。 */
async function verifyCoreTables(sql: AppSql): Promise<void> {
  const migrationsOk = await tableExists(sql, 'app_schema_migrations');
  const profilesOk = await tableExists(sql, 'profiles');
  if (migrationsOk) {
    console.log('[db] 结构检查: app_schema_migrations 表存在');
  } else {
    console.warn('[db] 结构检查: 未找到 app_schema_migrations（迁移可能被跳过）');
  }
  if (profilesOk) {
    console.log('[db] 结构检查: profiles 表存在');
  } else {
    console.warn('[db] 结构检查: 未找到 profiles，若未设置 SKIP_DB_MIGRATIONS，请查看上方迁移报错');
  }
}

/**
 * 按文件名排序执行迁移目录下的 SQL，未执行的写入 app_schema_migrations。
 */
export async function runMigrations(sql: AppSql): Promise<void> {
  if (process.env.SKIP_DB_MIGRATIONS === '1' || process.env.SKIP_DB_MIGRATIONS === 'true') {
    console.warn('[db] 已跳过数据库迁移（SKIP_DB_MIGRATIONS）');
    return;
  }

  console.log('[db] 正在检查迁移状态…');

  const hasMeta = await tableExists(sql, 'app_schema_migrations');
  const hasProfiles = await tableExists(sql, 'profiles');

  const dir = migrationsDir();
  let files: string[];
  try {
    files = (await readdir(dir))
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch (e) {
    console.error(`[db] 无法读取迁移目录: ${dir}`);
    throw e;
  }

  if (files.length === 0) {
    console.warn('[db] 迁移目录中没有 .sql 文件');
  }

  if (!hasMeta) {
    await createMigrationsTable(sql);
    console.log('[db] 已创建 app_schema_migrations（首次运行）');

    // 全新库：仅执行基线脚本（001），并登记所有迁移为已应用，避免逐个回放历史迁移。
    if (!hasProfiles) {
      const baseline = files.find((f) => f.startsWith('001_'));
      if (!baseline) {
        throw new Error('[db] 未找到基线脚本（期望 001_*.sql）');
      }
      const baselinePath = path.join(dir, baseline);
      console.log(`[db] 检测到全新库，执行基线初始化: ${baseline}`);
      await sql.begin(async (tx) => {
        await tx.file(baselinePath);
        for (const f of files) {
          await recordMigration(tx, f);
        }
      });
      console.log('[db] 已完成基线初始化并登记全部迁移版本');
      await verifyCoreTables(sql);
      return;
    }
  }

  const appliedRows = await sql`SELECT version FROM app_schema_migrations`;
  const applied = new Set(
    (appliedRows as unknown as { version: string }[]).map((r) => r.version)
  );
  const pendingAfterMeta = files.filter((f) => !applied.has(f));

  console.log(`[db] 迁移目录: ${dir}`);
  console.log(
    `[db] 脚本文件: ${files.length} 个；已应用: ${applied.size} 个；待执行: ${pendingAfterMeta.length} 个`
  );
  if (pendingAfterMeta.length > 0) {
    for (const f of pendingAfterMeta) {
      console.log(`[db]   · 待执行: ${f}`);
    }
  }

  for (const file of files) {
    if (applied.has(file)) continue;

    const fullPath = path.join(dir, file);
    console.log(`[db] 正在执行迁移: ${file}`);
    await sql.begin(async (tx) => {
      await tx.file(fullPath);
      await recordMigration(tx, file);
    });
    console.log(`[db] 已完成迁移: ${file}`);
  }

  if (pendingAfterMeta.length === 0 && files.length > 0) {
    console.log('[db] 数据库结构已是最新（无待执行迁移）');
  }

  await verifyCoreTables(sql);
}

/** 启动时：先检查连接，再按需执行迁移。 */
export async function runDatabaseStartup(sql: AppSql): Promise<void> {
  await checkDatabase(sql);
  await runMigrations(sql);
}
