import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Switch, List, Button, Input, Form, Divider, App, Upload, Modal, Select } from 'antd';
import { QqOutlined } from '@ant-design/icons';
import { GithubCdnAvatar } from '../components/GithubCdnAvatar';
import NotificationSettingsModal from '../components/NotificationSettingsModal';
import QqQrModal from '../components/QqQrModal';
import PageHeader from '../components/PageHeader';
import ResponsiveContainer from '../components/ResponsiveContainer';
import { Moon, Save, LogOut, Camera, Info, KeyRound, Languages, Bell } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../context/I18nContext';
import { uploadToGithub } from '../github';
import { apiJson } from '../lib/api';
import {
  getPermissionState,
  isPushSupported,
  registerPushSubscription,
  unregisterPushSubscription,
} from '../lib/browserPush';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, logout, refreshProfile } = useAuth();
  const { mode, toggleTheme } = useTheme();
  const { locale, setLocale, t, availableLocales } = useI18n();
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [qqModalOpen, setQqModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(
    'default'
  );
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

  useEffect(() => {
    const loadPushState = async () => {
      const supported = await isPushSupported();
      setPushSupported(supported);
      const permission = await getPermissionState();
      setPushPermission(permission);
    };
    void loadPushState();
  }, []);

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
      message.success(t('settings.updateSuccess'));
    } catch (error: any) {
      message.error(`${t('settings.updateFailed')} ${error.message}`);
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
      message.success(t('settings.avatarUploadSuccess'));
    } catch (e: any) {
      message.error(t('settings.avatarUploadFailed'));
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
      message.success(hasPassword ? t('settings.passwordUpdated') : t('settings.passwordSet'));
    } catch (error: any) {
      message.error(error.message || t('settings.passwordSaveFailed'));
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleEnablePush = async () => {
    setPushLoading(true);
    try {
      await registerPushSubscription();
      setPushPermission(await getPermissionState());
      message.success(t('settings.pushEnabled'));
    } catch (error: any) {
      const code = error?.message ?? '';
      if (code === 'permission-denied') {
        message.error(t('settings.pushPermissionDenied'));
      } else if (code === 'push-unavailable') {
        message.error(t('settings.pushUnavailable'));
      } else {
        message.error(t('settings.pushEnableFailed'));
      }
    } finally {
      setPushLoading(false);
    }
  };

  const handleDisablePush = async () => {
    setPushLoading(true);
    try {
      await unregisterPushSubscription();
      message.success(t('settings.pushDisabled'));
    } catch {
      message.error(t('settings.pushDisableFailed'));
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <ResponsiveContainer>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ paddingBottom: 100 }}
      >
      <PageHeader title={t('settings.title')} description={t('settings.desc')} />
      
      <Title level={4} style={{ marginTop: 24 }}>{t('settings.profile')}</Title>
      <Card className="sf-card" style={{ marginTop: 12 }}>
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
              <Text type="secondary">{t('settings.userId')} {user?.id}</Text>
              <br />
              <Text type="secondary">{t('settings.registeredEmail')} {user?.email}</Text>
            </div>
          </div>
          
          <Form.Item name="displayname" label={t('settings.nickname')} rules={[{ required: true, message: t('settings.nicknameRequired') }]}>
            <Input placeholder={t('settings.nicknamePlaceholder')} size="large" />
          </Form.Item>
          
          <Form.Item name="photourl" label={t('settings.avatarPath')}>
            <Input placeholder={t('settings.avatarPathPlaceholder')} size="large" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} icon={<Save size={18} />} block size="large">
            {t('settings.save')}
          </Button>
        </Form>
      </Card>

      <Title level={4} style={{ marginTop: 32 }}>{t('settings.security')}</Title>
      <Card className="sf-card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: '1 1 240px' }}>
            <Text strong>{t('settings.passwordLogin')}</Text>
            <br />
            <Text type="secondary">
              {hasPassword ? t('settings.passwordEnabled') : t('settings.passwordDisabled')}
            </Text>
          </div>
          <Button type="primary" icon={<KeyRound size={16} />} onClick={openPasswordModal}>
            {hasPassword ? t('settings.managePassword') : t('settings.setPassword')}
          </Button>
        </div>
      </Card>

      <Title level={4} style={{ marginTop: 32 }}>{t('settings.bindings')}</Title>
      <Card className="sf-card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: '1 1 200px' }}>
            <Text strong>QQ</Text>
            <br />
            <Text type="secondary">
              {profile?.qq_uin
                ? t('settings.qqBound', { uin: profile.qq_uin })
                : t('settings.qqNotBound')}
            </Text>
          </div>
          <Button
            type="primary"
            icon={<QqOutlined />}
            onClick={() => setQqModalOpen(true)}
          >
            {profile?.qq_uin ? t('settings.qqRebind') : t('settings.qqBind')}
          </Button>
        </div>
      </Card>

      <QqQrModal
        open={qqModalOpen}
        mode="bind"
        onClose={() => setQqModalOpen(false)}
        onBindComplete={onQqBindDone}
      />
      
      <Title level={4} style={{ marginTop: 32 }}>{t('settings.app')}</Title>
      <Card className="sf-card" style={{ marginTop: 12 }}>
        <List itemLayout="horizontal">
          <List.Item actions={[<Switch checked={mode === 'dark'} onChange={toggleTheme} />]}>
            <List.Item.Meta avatar={<Moon size={20} />} title={t('settings.darkMode')} />
          </List.Item>
          <List.Item
            actions={[
              <Select
                value={locale}
                style={{ minWidth: 140 }}
                options={availableLocales}
                onChange={(next) => {
                  setLocale(next);
                  message.success(t('settings.language.updated'));
                }}
              />,
            ]}
          >
            <List.Item.Meta
              avatar={<Languages size={20} />}
              title={t('settings.language.title')}
              description={t('settings.language.description')}
            />
          </List.Item>
          <List.Item
            extra={
              <Button
                onClick={() => void (pushPermission === 'granted' ? handleDisablePush() : handleEnablePush())}
                loading={pushLoading}
                disabled={!pushSupported}
              >
                {pushPermission === 'granted' ? t('settings.pushDisable') : t('settings.pushEnable')}
              </Button>
            }
          >
            <List.Item.Meta
              avatar={<Bell size={20} />}
              title={t('settings.pushTitle')}
              description={
                !pushSupported
                  ? t('settings.pushUnsupported')
                  : pushPermission === 'granted'
                    ? t('settings.pushStatusEnabled')
                    : t('settings.pushStatusDisabled')
              }
            />
          </List.Item>
          <List.Item
            extra={
              <Button type="link" onClick={() => setNotifyModalOpen(true)}>
                {t('settings.notifyManage')}
              </Button>
            }
          >
            <List.Item.Meta
              avatar={<Bell size={20} />}
              title={t('notify.settings.title')}
              description={t('notify.settings.descShort')}
            />
          </List.Item>
          <List.Item
            extra={
              <Button type="link" onClick={() => navigate('/about')}>
                {t('settings.go')}
              </Button>
            }
          >
            <List.Item.Meta
              avatar={<Info size={20} />}
              title={t('settings.about')}
              description={t('settings.aboutDesc')}
            />
          </List.Item>
        </List>
      </Card>

      <Divider style={{ margin: '40px 0' }} />
      
      <Button danger type="dashed" icon={<LogOut size={18} />} block size="large" onClick={logout}>
        {t('settings.logout')}
      </Button>

      <NotificationSettingsModal open={notifyModalOpen} onClose={() => setNotifyModalOpen(false)} />

      <Modal
        title={hasPassword ? t('settings.managePassword') : t('settings.setPassword')}
        open={passwordModalOpen}
        onCancel={() => setPasswordModalOpen(false)}
        onOk={() => passwordForm.submit()}
        confirmLoading={passwordSaving}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
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
              label={t('settings.currentPassword')}
              rules={[{ required: true, message: t('settings.currentPasswordRequired') }]}
            >
              <Input.Password placeholder={t('settings.currentPassword')} autoComplete="current-password" />
            </Form.Item>
          )}
          <Form.Item
            name="newPassword"
            label={t('settings.newPassword')}
            rules={[
              { required: true, message: t('settings.newPasswordRequired') },
              { min: 8, message: t('settings.newPasswordMin') },
            ]}
          >
            <Input.Password placeholder={t('settings.newPasswordPlaceholder')} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t('settings.confirmPassword')}
            dependencies={['newPassword']}
            rules={[
              { required: true, message: t('settings.confirmPasswordRequired') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('settings.confirmPasswordMismatch')));
                },
              }),
            ]}
          >
            <Input.Password placeholder={t('settings.confirmPasswordPlaceholder')} autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
      </motion.div>
    </ResponsiveContainer>
  );
};

export default Settings;
