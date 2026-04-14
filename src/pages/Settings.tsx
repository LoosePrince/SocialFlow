import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Switch, List, Button, Input, Form, Divider, App, Upload, Modal } from 'antd';
import { QqOutlined } from '@ant-design/icons';
import { GithubCdnAvatar } from '../components/GithubCdnAvatar';
import QqQrModal from '../components/QqQrModal';
import { Moon, Save, LogOut, Camera, Info, KeyRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { uploadToGithub } from '../github';
import { apiJson } from '../lib/api';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, logout, refreshProfile } = useAuth();
  const { mode, toggleTheme } = useTheme();
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [qqModalOpen, setQqModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean>(false);
  const { message } = App.useApp();

  const onQqBindDone = useCallback(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (profile) {
      form.setFieldsValue({
        displayname: profile.displayname,
        photourl: profile.photourl,
      });
    }
  }, [profile, form]);

  const fetchPasswordStatus = useCallback(async () => {
    try {
      const status = await apiJson<{ hasPassword: boolean }>('/api/auth/password/status');
      setHasPassword(status.hasPassword);
    } catch {
      setHasPassword(!!profile?.haspassword);
    }
  }, [profile?.haspassword]);

  useEffect(() => {
    if (user) {
      void fetchPasswordStatus();
    }
  }, [fetchPasswordStatus, user]);

  const handleUpdateProfile = async (values: any) => {
    if (!user) return;
    setLoading(true);
    try {
      await apiJson('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayname: values.displayname,
          photourl: values.photourl,
        }),
      });
      await refreshProfile();
      message.success('个人资料已更新');
    } catch (error: any) {
      message.error(`更新失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onAvatarUpload = async (file: File) => {
    if (!user?.id) return false;
    try {
      setLoading(true);
      const relativePath = await uploadToGithub(file, {
        scope: 'profile',
        contentId: user.id,
      });
      form.setFieldsValue({ photourl: relativePath });
      message.success('头像已上传，请点击保存修改');
    } catch (e: any) {
      message.error('头像上传失败');
    } finally {
      setLoading(false);
    }
    return false;
  };

  const openPasswordModal = () => {
    passwordForm.resetFields();
    setPasswordModalOpen(true);
  };

  const handleSavePassword = async (values: { currentPassword?: string; newPassword: string }) => {
    setPasswordSaving(true);
    try {
      await apiJson('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setHasPassword(true);
      setPasswordModalOpen(false);
      message.success(hasPassword ? '密码已更新' : '密码已设置');
    } catch (error: any) {
      message.error(error.message || '保存密码失败');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <motion.div 
      className="main-container"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ paddingBottom: 100 }}
    >
      <Title level={2}>设置</Title>
      
      <Title level={4} style={{ marginTop: 32 }}>个人资料</Title>
      <Card className="card" style={{ marginTop: 12 }}>
        <Form form={form} layout="vertical" onFinish={handleUpdateProfile}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative' }}>
              <GithubCdnAvatar src={profile?.photourl || ''} size={80} />
              <Upload 
                showUploadList={false} 
                beforeUpload={onAvatarUpload} 
                accept="image/*"
              >
                <Button 
                  size="small" 
                  shape="circle" 
                  icon={<Camera size={12}/>} 
                  style={{ position: 'absolute', bottom: 0, right: 0 }} 
                />
              </Upload>
            </div>
            <div style={{ flex: 1 }}>
              <Text type="secondary">用户 ID: {user?.id}</Text>
              <br />
              <Text type="secondary">注册邮箱: {user?.email}</Text>
            </div>
          </div>
          
          <Form.Item name="displayname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
            <Input placeholder="你的公开昵称" size="large" />
          </Form.Item>
          
          <Form.Item name="photourl" label="头像路径 (GitHub 相对路径或外部 URL)">
            <Input placeholder="profile/<用户ID>/<crc32>.jpg 或 https://..." size="large" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} icon={<Save size={18} />} block size="large">
            保存修改
          </Button>
        </Form>
      </Card>

      <Title level={4} style={{ marginTop: 32 }}>账号安全</Title>
      <Card className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: '1 1 240px' }}>
            <Text strong>密码登录</Text>
            <br />
            <Text type="secondary">
              {hasPassword ? '已设置密码，可使用邮箱 + 密码登录' : '未设置密码，设置后可使用邮箱 + 密码登录'}
            </Text>
          </div>
          <Button type="primary" icon={<KeyRound size={16} />} onClick={openPasswordModal}>
            {hasPassword ? '管理密码' : '设置密码'}
          </Button>
        </div>
      </Card>

      <Title level={4} style={{ marginTop: 32 }}>账号绑定</Title>
      <Card className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: '1 1 200px' }}>
            <Text strong>QQ</Text>
            <br />
            <Text type="secondary">
              {profile?.qq_uin
                ? `已绑定（uin: ${profile.qq_uin}）`
                : '未绑定：绑定后可使用 QQ 扫码登录'}
            </Text>
          </div>
          <Button
            type="primary"
            icon={<QqOutlined />}
            onClick={() => setQqModalOpen(true)}
          >
            {profile?.qq_uin ? '重新绑定 QQ' : '绑定 QQ'}
          </Button>
        </div>
      </Card>

      <QqQrModal
        open={qqModalOpen}
        mode="bind"
        onClose={() => setQqModalOpen(false)}
        onBindComplete={onQqBindDone}
      />
      
      <Title level={4} style={{ marginTop: 32 }}>应用</Title>
      <Card className="card" style={{ marginTop: 12 }}>
        <List itemLayout="horizontal">
          <List.Item actions={[<Switch checked={mode === 'dark'} onChange={toggleTheme} />]}>
            <List.Item.Meta avatar={<Moon size={20} />} title="深色模式" />
          </List.Item>
          <List.Item
            extra={
              <Button type="link" onClick={() => navigate('/about')}>
                前往
              </Button>
            }
          >
            <List.Item.Meta
              avatar={<Info size={20} />}
              title="关于 SocialFlow"
              description="技术栈、开源仓库、版权与友情链接"
            />
          </List.Item>
        </List>
      </Card>

      <Divider style={{ margin: '40px 0' }} />
      
      <Button danger type="dashed" icon={<LogOut size={18} />} block size="large" onClick={logout}>
        退出登录
      </Button>

      <Modal
        title={hasPassword ? '管理密码' : '设置密码'}
        open={passwordModalOpen}
        onCancel={() => setPasswordModalOpen(false)}
        onOk={() => passwordForm.submit()}
        confirmLoading={passwordSaving}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={(values) =>
            void handleSavePassword(values as { currentPassword?: string; newPassword: string })
          }
        >
          {hasPassword && (
            <Form.Item
              name="currentPassword"
              label="当前密码"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
            </Form.Item>
          )}
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码至少 8 位' },
            ]}
          >
            <Input.Password placeholder="至少 8 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </motion.div>
  );
};

export default Settings;
