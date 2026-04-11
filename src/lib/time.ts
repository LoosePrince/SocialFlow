/**
 * 将 API/数据库返回的时间统一为毫秒时间戳。
 * Postgres bigint、秒级 Unix、毫秒或字符串均可兼容。
 * 无法解析时返回 null（避免 dayjs(0) 等产生「数百年前」）。
 */
export function toMillis(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) && t > 0 ? t : null;
  }
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1e12) return Math.round(n * 1000);
  return Math.round(n);
}
