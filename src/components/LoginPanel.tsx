import { QqOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Divider, Form, Input, Space, theme, Typography } from 'antd';
import { Github } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
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
        throw new Error(error.message || '登录失败');
      }
    } catch (error: any) {
      message.error(error.message || '邮箱或密码错误');
    } finally {
      setPasswordLoading(false);
    }
  };

  const inner = (
    <>
      <Alert
        type="info"
        showIcon
        message="第一次登录？"
        description="请先通过 GitHub 登录以注册账户，然后在设置页中设置密码和QQ绑定以使用相应登录方式。"
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
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="请输入邮箱" autoComplete="email" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={passwordLoading} block size="large">
            登录
          </Button>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Space size={4}>
            <Text type="secondary">还没有账号？</Text>
            <Text type="secondary">先使用下方第三方登录</Text>
          </Space>
        </div>

        <Divider plain>
          <Text type="secondary">其他登录方式</Text>
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
          使用 GitHub 继续
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
          使用 QQ 登录
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
          登录 SocialFlow
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          使用第三方账号快速登录
        </Paragraph>
      </div>
      {inner}
    </>
  );
};

export default LoginPanel;
