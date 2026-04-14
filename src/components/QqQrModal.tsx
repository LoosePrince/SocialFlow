import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Spin, Typography, Button, Space, App } from 'antd';
import QRCode from 'react-qr-code';
import { RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useI18n } from '../context/I18nContext';
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
  const { t } = useI18n();
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
        setHint(body.msg || `${t('common.requestFailed')} (${res.status})`);
        return;
      }

      if (body.state === 'wait') {
        setHint(t('qq.scanHint'));
        return;
      }

      if (body.state === 'used') {
        setHint(t('qq.qrExpired'));
        clearTimer();
        return;
      }

      if (body.state === 'no_bind') {
        setHint(body.msg || t('qq.needBindFirst'));
        clearTimer();
        return;
      }

      if (body.state === 'error') {
        setHint(body.msg || t('qq.scanFailed'));
        if (res.status === 409) {
          clearTimer();
        }
        return;
      }

      if (body.state === 'ok') {
        clearTimer();
        if (m === 'bind') {
          message.success(t('qq.bindSuccess'));
          onBindCompleteRef.current?.();
          onClose();
          return;
        }

        if (!body.access_token || !body.refresh_token) {
          setHint(t('qq.tokenInvalid'));
          return;
        }

        const { error } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (error) {
          setHint(error.message || t('qq.sessionSetFailed'));
          return;
        }
        message.success(t('qq.loginSuccess'));
        const next = sanitizeReturnPath(returnToRef.current);
        onClose();
        navigate(next, { replace: true });
      }
    } catch (e) {
      setHint(e instanceof Error ? e.message : t('qq.pollFailed'));
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
        throw new Error(data.error || `${t('qq.qrFetchFailed')} (${res.status})`);
      }
      if (!data.code || !data.qrUrl) {
        throw new Error(t('qq.qrMissing'));
      }
      setQrUrl(data.qrUrl);
      startPolling(data.code);
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('qq.loadFailed'));
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

  const title = mode === 'bind' ? t('qq.bindTitle') : t('qq.loginTitle');

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
          ? t('qq.loginDesc')
          : t('qq.bindDesc')}
      </Paragraph>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 220 }}>
        {loadingCode && <Spin size="large" />}
        {!loadingCode && qrUrl && (
          <div
            role="img"
            aria-label={t('qq.qrAria')}
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
          {t('qq.refreshQr')}
        </Button>
      </Space>
    </Modal>
  );
};

export default QqQrModal;
