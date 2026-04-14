import { QqOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Divider, Form, Input, Space, theme, Typography } from 'antd';
import { Github } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { apiJson } from '../lib/api';
import { supabase } from '../supabase';
import QqQrModal from './QqQrModal';

const { Title, Text, Paragraph } = Typography;

export type LoginPanelVariant = 'page' | 'modal';

export interface LoginPanelProps {
  variant?: LoginPanelVariant;
  /** OAuth 完成后要进入的站内路径（已 sanitize） */
  returnTo: string;
}

const LoginPanel: React.FC<LoginPanelProps> = ({ variant = 'page', returnTo }) => {
  const { login } = useAuth();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { t } = useI18n();
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [qqOpen, setQqOpen] = useState(false);

  const handleGithub = () => {
    void login(returnTo);
  };

  const closeQq = useCallback(() => setQqOpen(false), []);

  const handlePasswordLogin = async (values: { email: string; password: string }) => {
    setPasswordLoading(true);
    try {
      const session = await apiJson<{
        access_token: string;
        refresh_token: string;
      }>('/api/auth/password-login', {
        method: 'POST',
        body: JSON.stringify({
          email: values.email.trim(),
          password: values.password,
        }),
      });
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) {
        throw new Error(error.message || t('login.failed'));
      }
    } catch (error: any) {
      message.error(error.message || t('login.failed'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const inner = (
    <>
      <Alert
        type="info"
        showIcon
        message={t('login.alertTitle')}
        description={t('login.alertDesc')}
        style={{ marginBottom: variant === 'modal' ? 12 : 20 }}
      />

      <Card
        variant="borderless"
        style={{
          borderRadius: token.borderRadiusLG,
          boxShadow: variant === 'page' ? token.boxShadowSecondary : 'none',
          border: variant === 'page' ? `1px solid ${token.colorBorderSecondary}` : 'none',
        }}
      >
        <Form
          layout="vertical"
          requiredMark={false}
          onFinish={(values) =>
            void handlePasswordLogin(values as { email: string; password: string })
          }
        >
          <Form.Item
            label={t('login.email')}
            name="email"
            rules={[
              { required: true, message: t('login.emailRequired') },
              { type: 'email', message: t('login.emailInvalid') },
            ]}
          >
            <Input placeholder={t('login.email')} autoComplete="email" />
          </Form.Item>
          <Form.Item
            label={t('login.password')}
            name="password"
            rules={[{ required: true, message: t('login.passwordRequired') }]}
          >
            <Input.Password placeholder={t('login.password')} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={passwordLoading} block size="large">
            {t('login.submit')}
          </Button>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Space size={4}>
            <Text type="secondary">{t('login.noAccount')}</Text>
            <Text type="secondary">{t('login.useThirdParty')}</Text>
          </Space>
        </div>

        <Divider plain>
          <Text type="secondary">{t('login.otherMethods')}</Text>
        </Divider>

        <Button
          block
          size="large"
          icon={<Github size={18} />}
          onClick={handleGithub}
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {t('login.withGithub')}
        </Button>

        <Button
          block
          size="large"
          icon={<QqOutlined style={{ fontSize: 18 }} />}
          onClick={() => setQqOpen(true)}
          style={{
            marginTop: 12,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {t('login.withQq')}
        </Button>
      </Card>

      <QqQrModal open={qqOpen} mode="login" onClose={closeQq} returnTo={returnTo} />
    </>
  );

  if (variant === 'modal') {
    return inner;
  }

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <Title level={2} style={{ marginBottom: 8 }}>
          {t('login.pageTitle')}
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t('login.pageSubTitle')}
        </Paragraph>
      </div>
      {inner}
    </>
  );
};

export default LoginPanel;
