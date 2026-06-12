import { SignJWT, jwtVerify } from 'jose';
import { getRuntimeConfigValue } from './runtimeConfig.js';

const TICKET_TTL_SEC = 15 * 60;

export type QqRegisterTicketPayload = {
  uin: string;
};

async function ticketSecret(): Promise<Uint8Array> {
  const raw = (await getRuntimeConfigValue('SUPABASE_SERVICE_ROLE_KEY'))?.trim();
  if (!raw) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 未配置，无法签发 QQ 注册 ticket');
  }
  return new TextEncoder().encode(raw);
}

export async function issueQqRegisterTicket(uin: string): Promise<string> {
  return new SignJWT({ uin })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TICKET_TTL_SEC}s`)
    .setSubject('qq-register')
    .sign(await ticketSecret());
}

export async function verifyQqRegisterTicket(token: string): Promise<QqRegisterTicketPayload> {
  const { payload } = await jwtVerify(token, await ticketSecret(), {
    algorithms: ['HS256'],
    subject: 'qq-register',
  });
  const uin = typeof payload.uin === 'string' ? payload.uin.trim() : '';
  if (!uin) {
    throw new Error('无效的注册 ticket');
  }
  return { uin };
}

/** QQ 账号注册时使用的邮箱（{uin}@qq.com） */
export function qqSyntheticEmail(uin: string): string {
  return `${uin}@qq.com`;
}

/** QQ 官方头像 CDN（nk 为 uin） */
export function qqAvatarUrl(uin: string): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`;
}
