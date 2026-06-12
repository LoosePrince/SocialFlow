import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeConfigValue, getSupabaseProjectUrl } from './runtimeConfig.js';

let adminClient: SupabaseClient | null = null;

export async function getSupabaseAdmin(): Promise<SupabaseClient> {
  if (adminClient) return adminClient;

  const url = await getSupabaseProjectUrl();
  const serviceKey = (await getRuntimeConfigValue('SUPABASE_SERVICE_ROLE_KEY'))?.trim();
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 或 Supabase URL 未配置');
  }

  adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

export async function createSupabaseUserForQqRegister(input: {
  uin: string;
  email: string;
  displayname: string;
  photourl?: string;
}): Promise<{ id: string; email: string }> {
  const admin = await getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: {
      full_name: input.displayname,
      ...(input.photourl ? { avatar_url: input.photourl } : {}),
      qq_uin: input.uin,
      registration_method: 'qq',
    },
  });

  if (error) {
    throw new Error(error.message || 'createUser 失败');
  }

  const user = data.user;
  if (!user?.id || !user.email) {
    throw new Error('createUser 未返回有效用户');
  }

  return { id: user.id, email: user.email };
}

export async function deleteSupabaseUser(userId: string): Promise<void> {
  const admin = await getSupabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(error.message || 'deleteUser 失败');
  }
}
