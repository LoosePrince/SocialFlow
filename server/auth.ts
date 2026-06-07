import type { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, decodeJwt } from 'jose';
import {
  getRuntimeConfigValue,
  getSupabaseProjectUrl,
} from './runtimeConfig.js';

export interface AuthUser {
  sub: string;
  email?: string;
  /** Supabase JWT payload */
  payload: Record<string, unknown>;
}

type AppEnv = { Variables: { user: AuthUser } };

const getBearer = (c: { req: { header: (n: string) => string | undefined } }): string | undefined => {
  const h = c.req.header('Authorization');
  if (!h?.startsWith('Bearer ')) return undefined;
  return h.slice(7).trim();
};

async function supabaseAuthIssuer(baseUrl?: string): Promise<string | undefined> {
  const explicit = (await getRuntimeConfigValue('SUPABASE_JWT_ISSUER'))?.trim();
  if (explicit) return explicit;
  const base = (baseUrl ?? (await getSupabaseProjectUrl())).replace(/\/$/, '');
  if (!base) return undefined;
  return `${base}/auth/v1`;
}

function userFromPayload(payload: Record<string, unknown>): AuthUser {
  const sub = String(payload.sub ?? '');
  if (!sub) throw new Error('Invalid token: no sub');
  return {
    sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    payload,
  };
}

const jwksByBase = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwksForBase(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, '');
  let jwks = jwksByBase.get(normalized);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${normalized}/auth/v1/.well-known/jwks.json`));
    jwksByBase.set(normalized, jwks);
  }
  return jwks;
}

/** Supabase 新 JWT Signing Keys：RS256 / ES256 等，用 JWKS 验签（无需 SUPABASE_JWT_SECRET） */
async function verifyAsymmetricSupabaseJwt(token: string, baseUrl: string): Promise<AuthUser> {
  const jwks = getJwksForBase(baseUrl);
  const issuer = (await supabaseAuthIssuer(baseUrl)) || `${baseUrl.replace(/\/$/, '')}/auth/v1`;
  const audience = (await getRuntimeConfigValue('SUPABASE_JWT_AUD', 'authenticated'))?.trim() || 'authenticated';

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      clockTolerance: 30,
    });
    return userFromPayload(payload as Record<string, unknown>);
  } catch {
    const { payload } = await jwtVerify(token, jwks, {
      clockTolerance: 30,
    });
    return userFromPayload(payload as Record<string, unknown>);
  }
}

/** Legacy：Dashboard JWT Secret，HS256 */
async function verifyLegacyHs256Jwt(token: string, secret: string): Promise<AuthUser> {
  const key = new TextEncoder().encode(secret);
  const issuer = await supabaseAuthIssuer();
  const audience = (await getRuntimeConfigValue('SUPABASE_JWT_AUD', 'authenticated'))?.trim() || 'authenticated';

  const strictOpts = {
    algorithms: ['HS256'],
    clockTolerance: 30,
    ...(issuer ? { issuer } : {}),
    audience,
  };

  try {
    const { payload } = await jwtVerify(token, key, strictOpts);
    return userFromPayload(payload as Record<string, unknown>);
  } catch (strictErr) {
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
        clockTolerance: 30,
      });
      return userFromPayload(payload as Record<string, unknown>);
    } catch {
      throw strictErr;
    }
  }
}

export async function verifySupabaseJwt(token: string): Promise<AuthUser> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw new Error('Invalid token');
  }

  const base = await getSupabaseProjectUrl();

  if (alg === 'HS256') {
    const secret = (await getRuntimeConfigValue('SUPABASE_JWT_SECRET'))?.trim();
    if (!secret) {
      throw new Error('SUPABASE_JWT_SECRET is not set (JWT uses HS256)');
    }
    return verifyLegacyHs256Jwt(token, secret);
  }

  // 非对称密钥（JWT Signing Keys）：用项目 URL 拉 JWKS
  if (!base) {
    throw new Error(
      'Set SUPABASE_URL or VITE_SUPABASE_URL for asymmetric JWT verification (or use Legacy HS256 + SUPABASE_JWT_SECRET)'
    );
  }
  return verifyAsymmetricSupabaseJwt(token, base);
}

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getBearer(c);
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const user = await verifySupabaseJwt(token);
    c.set('user', user);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

/** 从 JWT 取 OAuth / 用户元数据（Supabase 写入 user_metadata） */
export function metadataFromJwt(user: AuthUser): {
  displayname: string;
  photourl: string;
  email: string;
} {
  const meta = (user.payload.user_metadata as Record<string, string> | undefined) ?? {};
  const email = user.email ?? '';
  const displayname =
    meta.full_name ||
    meta.name ||
    meta.user_name ||
    meta.preferred_username ||
    email ||
    '新用户';
  const photourl = meta.avatar_url || meta.picture || '';
  return { displayname, photourl, email };
}

export async function isAdminEmail(email: string | undefined): Promise<boolean> {
  const configured = (await getRuntimeConfigValue('ADMIN_EMAIL'))?.trim().toLowerCase();
  if (!configured || !email) return false;
  return email.trim().toLowerCase() === configured;
}

/** 解码但不验证（仅用于读取不可验场景）；生产应只用 verifySupabaseJwt */
export function decodePayload(token: string): Record<string, unknown> {
  return decodeJwt(token) as Record<string, unknown>;
}
