import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  max: 15,
});

/** 独立连接，仅用于 LISTEN（postgres.js 要求） */
export const listenSql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  max: 1,
});

export { sql };
