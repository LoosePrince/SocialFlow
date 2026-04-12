/**
 * 与 PF-MCDR-WebUI 中 qq_qr_login_service 一致：调用 q.qq.com 开放平台扫码接口。
 * @see https://github.com/PFingan-Code/PF-MCDR-WebUI/blob/main/src/guguwebui/services/qq_qr_login_service.py
 */

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function qqHeaders(): Record<string, string> {
  return {
    host: 'q.qq.com',
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': CHROME_UA,
  };
}

function asJsonObject(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Unexpected JSON payload (expected object).');
  }
  return data as Record<string, unknown>;
}

export type QqScanState = 'wait' | 'used' | 'ok' | 'error';

export interface QqLoginCodeResult {
  code: string;
  qrUrl: string;
}

export interface QqScanStatusResult {
  state: QqScanState;
  uin?: string;
  msg?: string;
}

export async function requestQqLoginCode(): Promise<QqLoginCodeResult> {
  const url = 'https://q.qq.com/ide/devtoolAuth/GetLoginCode';
  const r = await fetch(url, { headers: qqHeaders(), signal: AbortSignal.timeout(30_000) });
  if (!r.ok) {
    throw new Error(`GetLoginCode HTTP ${r.status}`);
  }
  const payload = asJsonObject(await r.json());
  const apiCode = payload.code;
  if (apiCode === undefined || Number(apiCode) !== 0) {
    throw new Error('GetLoginCode failed (unexpected response code).');
  }
  const data = asJsonObject(payload.data ?? {});
  const code = String(data.code ?? '').trim();
  if (!code) {
    throw new Error('GetLoginCode failed (missing data.code).');
  }
  const qrUrl = `https://h5.qzone.qq.com/qqq/code/${code}?_proxy=1&from=ide`;
  return { code, qrUrl };
}

export async function queryQqScanStatus(code: string): Promise<QqScanStatusResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { state: 'error', msg: 'missing code' };
  }
  const url = new URL('https://q.qq.com/ide/devtoolAuth/syncScanSateGetTicket');
  url.searchParams.set('code', trimmed);

  let r: Response;
  try {
    r = await fetch(url.toString(), { headers: qqHeaders(), signal: AbortSignal.timeout(30_000) });
  } catch {
    return { state: 'error', msg: 'status query network error' };
  }

  if (!r.ok) {
    return { state: 'error', msg: `status HTTP ${r.status}` };
  }

  let payload: Record<string, unknown>;
  try {
    payload = asJsonObject(await r.json());
  } catch {
    return { state: 'error', msg: 'invalid JSON' };
  }

  const resCode = Number(payload.code ?? 0);
  const rawData = payload.data;
  const data = rawData && typeof rawData === 'object' && !Array.isArray(rawData)
    ? (rawData as Record<string, unknown>)
    : {};

  if (resCode === 0) {
    if (Number(data.ok ?? 0) !== 1) {
      return { state: 'wait' };
    }
    const uin = String(data.uin ?? '').trim();
    if (!uin) {
      return { state: 'error', msg: 'missing uin' };
    }
    return { state: 'ok', uin };
  }

  if (resCode === -10003) {
    return { state: 'used' };
  }

  return { state: 'error', msg: `code=${resCode}` };
}
