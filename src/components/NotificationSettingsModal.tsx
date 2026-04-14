import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Flex, List, Modal, Switch, Typography } from 'antd';
import { apiJson } from '../lib/api';
import { useI18n } from '../context/I18nContext';

const { Text } = Typography;

export type NotificationTypeKey =
  | 'recommend'
  | 'like'
  | 'comment'
  | 'reply'
  | 'delete'
  | 'mention';

export interface NotificationSettings {
  receive_recommend: boolean;
  alert_recommend: boolean;
  receive_like: boolean;
  alert_like: boolean;
  receive_comment: boolean;
  alert_comment: boolean;
  receive_reply: boolean;
  alert_reply: boolean;
  receive_delete: boolean;
  alert_delete: boolean;
  receive_mention: boolean;
  alert_mention: boolean;
}

const defaultSettings: NotificationSettings = {
  receive_recommend: true,
  alert_recommend: true,
  receive_like: true,
  alert_like: true,
  receive_comment: true,
  alert_comment: true,
  receive_reply: true,
  alert_reply: true,
  receive_delete: true,
  alert_delete: true,
  receive_mention: true,
  alert_mention: true,
};

interface NotificationSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({ open, onClose }) => {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);

  const rows = useMemo(
    () =>
      (['recommend', 'like', 'comment', 'reply', 'delete', 'mention'] as NotificationTypeKey[]).map(
        (type) => ({
          type,
          label: t(`notify.type.${type}`),
          receiveKey: `receive_${type}` as keyof NotificationSettings,
          alertKey: `alert_${type}` as keyof NotificationSettings,
        })
      ),
    [t]
  );

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiJson<NotificationSettings>('/api/notification-settings');
        setSettings({
          ...defaultSettings,
          ...data,
        });
      } catch {
        message.error(t('notify.settings.loadFailed'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [message, open, t]);

  const setReceive = (type: NotificationTypeKey, checked: boolean) => {
    const receiveKey = `receive_${type}` as keyof NotificationSettings;
    const alertKey = `alert_${type}` as keyof NotificationSettings;
    setSettings((prev) => ({
      ...prev,
      [receiveKey]: checked,
      [alertKey]: checked ? prev[alertKey] : false,
    }));
  };

  const setAlert = (type: NotificationTypeKey, checked: boolean) => {
    const alertKey = `alert_${type}` as keyof NotificationSettings;
    setSettings((prev) => ({
      ...prev,
      [alertKey]: checked,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiJson('/api/notification-settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      message.success(t('notify.settings.saved'));
      onClose();
    } catch {
      message.error(t('notify.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('notify.settings.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={680}
    >
      <Text type="secondary">{t('notify.settings.desc')}</Text>
      <List
        loading={loading}
        style={{ marginTop: 12 }}
        dataSource={rows}
        renderItem={(row) => {
          const receive = settings[row.receiveKey];
          const alert = settings[row.alertKey];
          return (
            <List.Item>
              <Flex justify="space-between" align="center" style={{ width: '100%' }} gap={12}>
                <Text strong>{row.label}</Text>
                <Flex align="center" gap={16}>
                  <Flex align="center" gap={8}>
                    <Text type="secondary">{t('notify.settings.receive')}</Text>
                    <Switch checked={!!receive} onChange={(v) => setReceive(row.type, v)} />
                  </Flex>
                  <Flex align="center" gap={8}>
                    <Text type="secondary">{t('notify.settings.alert')}</Text>
                    <Switch
                      checked={!!alert}
                      disabled={!receive}
                      onChange={(v) => setAlert(row.type, v)}
                    />
                  </Flex>
                </Flex>
              </Flex>
            </List.Item>
          );
        }}
      />
      <Flex justify="end" gap={8} style={{ marginTop: 16 }}>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="primary" loading={saving} onClick={() => void handleSave()}>
          {t('common.save')}
        </Button>
      </Flex>
    </Modal>
  );
};

export default NotificationSettingsModal;
