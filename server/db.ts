import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

function parseConnectionMax() {
  const raw = process.env.DATABASE_MAX_CONNECTIONS ?? process.env.DB_MAX_CONNECTIONS;
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 5;
  return Math.min(parsed, 20);
}

export const databaseMaxConnections = parseConnectionMax();

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  max: databaseMaxConnections,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
});

/** 独立连接，仅用于 LISTEN（postgres.js 要求） */
export const listenSql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  max: 1,
});

let closing = false;
export async function closeDatabaseConnections() {
  if (closing) return;
  closing = true;
  await Promise.allSettled([sql.end({ timeout: 5 }), listenSql.end({ timeout: 5 })]);
}

export { sql };
