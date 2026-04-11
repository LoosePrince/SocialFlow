/** 防止开放重定向：仅允许站内相对路径 */
export function sanitizeReturnPath(path: string): string {
  const p = path.trim();
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('\\')) return '/';
  return p;
}
