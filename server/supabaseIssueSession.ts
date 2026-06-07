import { createClient } from '@supabase/supabase-js';
import { getRuntimeConfigValue, getSupabaseProjectUrl } from './runtimeConfig.js';

/**
 * 使用 Service Role：admin generateLink(magiclink) + verifyOtp(token_hash) 换取用户 Session，
 * 供 QQ 登录等受信后端流程下发给前端 setSession。
 */
export async function issueSupabaseSessionForEmail(email: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
}> {
  const url = await getSupabaseProjectUrl();
  const serviceKey = (await getRuntimeConfigValue('SUPABASE_SERVICE_ROLE_KEY'))?.trim();
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 或 Supabase URL 未配置，无法签发 QQ 登录会话');
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: email.trim(),
  });

  if (linkErr) {
    throw new Error(linkErr.message || 'generateLink 失败');
  }

  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash || typeof tokenHash !== 'string') {
    throw new Error('generateLink 未返回 hashed_token');
  }

  const { data: sessionData, error: verifyErr } = await admin.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  });

  if (verifyErr) {
    throw new Error(verifyErr.message || 'verifyOtp 失败');
  }

  const session = sessionData?.session;
  if (!session?.access_token || !session.refresh_token) {
    throw new Error('未能获取 access_token / refresh_token');
  }

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    ...(session.expires_at !== undefined ? { expires_at: session.expires_at } : {}),
  };
}
