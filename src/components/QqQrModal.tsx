import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Spin, Typography, Button, Space, App } from 'antd';
import QRCode from 'react-qr-code';
import { RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { apiFetch, apiUrl } from '../lib/api';
import { sanitizeReturnPath } from '../lib/navigation';

const { Text, Paragraph } = Typography;

const POLL_MS = 2000;

type PollState = 'wait' | 'used' | 'ok' | 'error' | 'no_bind';

interface PollBody {
  state: PollState;
  msg?: string;
  access_token?: string;
  refresh_token?: string;
}

export interface QqQrModalProps {
  open: boolean;
  mode: 'bind' | 'login';
  onClose: () => void;
  onBindComplete?: () => void;
  returnTo?: string;
}

const QqQrModal: React.FC<QqQrModalProps> = ({
  open,
  mode,
  onClose,
  onBindComplete,
  returnTo = '/',
}) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loadingCode, setLoadingCode] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [hint, setHint] = useState<string>('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCodeRef = useRef<string | null>(null);
  const modeRef = useRef(mode);
  const onBindCompleteRef = useRef(onBindComplete);
  const returnToRef = useRef(returnTo);

  modeRef.current = mode;
  onBindCompleteRef.current = onBindComplete;
  returnToRef.current = returnTo;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runPollTick = useCallback(async () => {
    const code = pollCodeRef.current;
    if (!code) return;

    const m = modeRef.current;
    const path =
      m === 'bind'
        ? `/api/qq/bind/poll?code=${encodeURIComponent(code)}`
        : `/api/qq/login/poll?code=${encodeURIComponent(code)}`;

    try {
      const res = await apiFetch(path);
      const body = (await res.json()) as PollBody;

      if (!res.ok && body.state !== 'error') {
        setHint(body.msg || `请求失败 (${res.status})`);
        return;
      }

      if (body.state === 'wait') {
        setHint('请使用手机 QQ 扫描二维码');
        return;
      }

      if (body.state === 'used') {
        setHint('二维码已失效，请点击下方刷新');
        clearTimer();
        return;
      }

      if (body.state === 'no_bind') {
        setHint(body.msg || '请先在设置中绑定 QQ');
        clearTimer();
        return;
      }

      if (body.state === 'error') {
        setHint(body.msg || '扫码失败');
        if (res.status === 409) {
          clearTimer();
        }
        return;
      }

      if (body.state === 'ok') {
        clearTimer();
        if (m === 'bind') {
          message.success('QQ 绑定成功');
          onBindCompleteRef.current?.();
          onClose();
          return;
        }

        if (!body.access_token || !body.refresh_token) {
          setHint('登录令牌异常，请重试');
          return;
        }

        const { error } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (error) {
          setHint(error.message || '设置会话失败');
          return;
        }
        message.success('QQ 登录成功');
        const next = sanitizeReturnPath(returnToRef.current);
        onClose();
        navigate(next, { replace: true });
      }
    } catch (e) {
      setHint(e instanceof Error ? e.message : '轮询失败');
    }
  }, [clearTimer, message, navigate, onClose]);

  const startPolling = useCallback(
    (code: string) => {
      clearTimer();
      pollCodeRef.current = code;
      void runPollTick();
      timerRef.current = setInterval(() => void runPollTick(), POLL_MS);
    },
    [clearTimer, runPollTick]
  );

  const loadCode = useCallback(async () => {
    setLoadingCode(true);
    setHint('');
    setQrUrl(null);
    pollCodeRef.current = null;
    clearTimer();
    try {
      const res = await fetch(apiUrl('/api/qq/login-code'));
      const data = (await res.json()) as { code?: string; qrUrl?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || `获取二维码失败 (${res.status})`);
      }
      if (!data.code || !data.qrUrl) {
        throw new Error('接口未返回二维码');
      }
      setQrUrl(data.qrUrl);
      startPolling(data.code);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoadingCode(false);
    }
  }, [clearTimer, message, startPolling]);

  const loadCodeRef = useRef(loadCode);
  loadCodeRef.current = loadCode;

  useEffect(() => {
    if (!open) {
      clearTimer();
      pollCodeRef.current = null;
      setQrUrl(null);
      setHint('');
      return;
    }
    void loadCodeRef.current();
    return () => clearTimer();
  }, [open, mode, clearTimer]);

  const title = mode === 'bind' ? '绑定 QQ 账号' : 'QQ 登录';

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={400}
    >
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {mode === 'login'
          ? '仅适用于已在设置中绑定过 QQ 的账号；与 GitHub 登录共用同一用户资料。'
          : '使用手机 QQ 扫描下方二维码完成绑定，请勿向他人展示。'}
      </Paragraph>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 220 }}>
        {loadingCode && <Spin size="large" />}
        {!loadingCode && qrUrl && (
          <div
            role="img"
            aria-label="QQ 授权链接二维码，请使用手机 QQ 扫描"
            style={{
              padding: 12,
              background: '#ffffff',
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.06)',
              lineHeight: 0,
            }}
          >
            <QRCode value={qrUrl} size={200} level="M" fgColor="#000000" bgColor="#ffffff" />
          </div>
        )}
        {hint ? (
          <Text type="secondary" style={{ marginTop: 16, textAlign: 'center' }}>
            {hint}
          </Text>
        ) : null}
      </div>

      <Space style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}>
        <Button icon={<RefreshCw size={16} />} onClick={() => void loadCode()} disabled={loadingCode}>
          刷新二维码
        </Button>
      </Space>
    </Modal>
  );
};

export default QqQrModal;
