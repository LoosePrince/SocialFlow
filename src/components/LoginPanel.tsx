import React from 'react';
import { Card, Form, Input, Button, Typography, Divider, Alert, Space, theme } from 'antd';
import { Github } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

  const handleGithub = () => {
    void login(returnTo);
  };

  const inner = (
    <>
      <Alert
        type="info"
        showIcon
        message="邮箱与密码登录、注册暂未开放"
        description="若需账号密码方式，请等待后续版本；当前请使用 GitHub 登录。"
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
        <Form layout="vertical" requiredMark={false}>
          <Form.Item label="邮箱">
            <Input disabled placeholder="暂未开放" autoComplete="off" />
          </Form.Item>
          <Form.Item label="密码">
            <Input.Password disabled placeholder="暂未开放" autoComplete="off" />
          </Form.Item>
          <Button type="primary" block size="large" disabled>
            登录
          </Button>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Space size={4}>
            <Text type="secondary">还没有账号？</Text>
            <Text type="secondary">注册（暂未开放）</Text>
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
      </Card>
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
