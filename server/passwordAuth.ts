import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const PASSWORD_MIN_LENGTH = 8;
const PBKDF2_DIGEST = 'sha256';
const PBKDF2_ITERATIONS = 210000;
const PBKDF2_KEYLEN = 32;

export function validatePasswordStrength(password: string): string | null {
  if (!password || typeof password !== 'string') {
    return '密码不能为空';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `密码至少需要 ${PASSWORD_MIN_LENGTH} 位`;
  }
  return null;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString(
    'base64url'
  );
  return `pbkdf2$${PBKDF2_DIGEST}$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 5) return false;
  const [scheme, digest, iterStr, salt, expected] = parts;
  if (scheme !== 'pbkdf2' || digest !== PBKDF2_DIGEST) return false;

  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations < 100000) return false;

  const actual = pbkdf2Sync(password, salt, iterations, PBKDF2_KEYLEN, digest).toString('base64url');
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
