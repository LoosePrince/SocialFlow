import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';

/** 优先使用与当前模块同目录的 migrations（dist-server 构建会复制 SQL）；否则使用项目根下 server/migrations（tsx / 从仓库根启动）。 */
export function migrationsDir(): string {
  const besideModule = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  if (existsSync(besideModule)) return besideModule;
  return path.join(process.cwd(), 'server', 'migrations');
}

/** 连接与基本可读性检查；失败时抛出，供启动流程中止。 */
export async function checkDatabase(sql: postgres.Sql): Promise<void> {
  console.log('[db] 正在检查数据库连接…');
  try {
    const rows = await sql`
      SELECT current_database() AS db, version() AS pg_version
    `;
    const row = rows[0] as { db: string; pg_version: string };
    const verLine = row.pg_version.split('\n')[0].trim();
    console.log('[db] 连接成功');
    console.log(`[db]   · 当前数据库: ${row.db}`);
    console.log(`[db]   · ${verLine}`);
  } catch (err) {
    console.error('[db] 数据库连接失败，请检查 DATABASE_URL、SSL（如 require）与网络是否可用。');
    throw err;
  }
}

/** 迁移应用后核对核心业务表是否存在（仅作提示，不替代迁移失败时的 SQL 报错）。 */
async function verifyCoreTables(sql: postgres.Sql): Promise<void> {
  const rows = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'profiles'
    ) AS profiles_ok,
    EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'app_schema_migrations'
    ) AS migrations_table_ok
  `;
  const row = rows[0] as { profiles_ok: boolean; migrations_table_ok: boolean };
  if (row.migrations_table_ok) {
    console.log('[db] 结构检查: app_schema_migrations 表存在');
  } else {
    console.warn('[db] 结构检查: 未找到 app_schema_migrations（迁移可能被跳过）');
  }
  if (row.profiles_ok) {
    console.log('[db] 结构检查: public.profiles 表存在');
  } else {
    console.warn('[db] 结构检查: 未找到 public.profiles，若未设置 SKIP_DB_MIGRATIONS，请查看上方迁移报错');
  }
}

/**
 * 按文件名排序执行 server/migrations/*.sql，未执行的写入 app_schema_migrations。
 */
export async function runMigrations(sql: postgres.Sql): Promise<void> {
  if (process.env.SKIP_DB_MIGRATIONS === '1' || process.env.SKIP_DB_MIGRATIONS === 'true') {
    console.warn('[db] 已跳过数据库迁移（SKIP_DB_MIGRATIONS）');
    return;
  }

  console.log('[db] 正在检查迁移状态…');

  const metaRows = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'app_schema_migrations'
    ) AS migration_table_present
  `;
  const hasMeta = (metaRows[0] as { migration_table_present: boolean }).migration_table_present;
  if (!hasMeta) {
    await sql`
      CREATE TABLE app_schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    console.log('[db] 已创建 app_schema_migrations（首次运行）');
  }

  const appliedRows = await sql`SELECT version FROM app_schema_migrations`;
  const applied = new Set(
    (appliedRows as unknown as { version: string }[]).map((r) => r.version)
  );

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

  const pending = files.filter((f) => !applied.has(f));

  console.log(`[db] 迁移目录: ${dir}`);
  console.log(`[db] 脚本文件: ${files.length} 个；已应用: ${applied.size} 个；待执行: ${pending.length} 个`);
  if (pending.length > 0) {
    for (const f of pending) {
      console.log(`[db]   · 待执行: ${f}`);
    }
  }

  if (files.length === 0) {
    console.warn('[db] 迁移目录中没有 .sql 文件');
  }

  for (const file of files) {
    if (applied.has(file)) continue;

    const fullPath = path.join(dir, file);
    console.log(`[db] 正在执行迁移: ${file}`);
    await sql.begin(async (tx) => {
      await tx.file(fullPath);
      await tx`INSERT INTO app_schema_migrations ${tx({ version: file })}`;
    });
    console.log(`[db] 已完成迁移: ${file}`);
  }

  if (pending.length === 0 && files.length > 0) {
    console.log('[db] 数据库结构已是最新（无待执行迁移）');
  }

  await verifyCoreTables(sql);
}

/** 启动时：先检查连接，再按需执行迁移。 */
export async function runDatabaseStartup(sql: postgres.Sql): Promise<void> {
  await checkDatabase(sql);
  await runMigrations(sql);
}
