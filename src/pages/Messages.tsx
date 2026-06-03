import React from 'react';
import { List, Avatar, Typography, Badge, Button, Empty, Space, Modal, Card, Flex } from 'antd';
import { MessagesPageSkeleton } from '../components/PageSkeletons';
import { AtSign, Heart, CheckCircle2, Settings } from 'lucide-react';
import { useNotificationCenter } from '../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';
import { apiJson } from '../lib/api';
import { toMillis } from '../lib/time';
import NotificationSettingsModal from '../components/NotificationSettingsModal';

const { Title, Text } = Typography;

const Messages: React.FC = () => {
  const { notifications, loading, refresh } = useNotificationCenter();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [silentOpen, setSilentOpen] = React.useState(false);

  const alertNotifications = notifications.filter((n) => n.isAlert !== false);
  const silentNotifications = notifications.filter((n) => n.isAlert === false);

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      await apiJson('/api/notifications/read-all', { method: 'PATCH' });
      await refresh();
    } catch {
      console.error('Failed to mark all as read');
    }
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.isRead) {
      try {
        await apiJson(`/api/notifications/${notif.id}/read`, { method: 'PATCH' });
        await refresh();
      } catch {
        /* ignore */
      }
    }
    const path = notif.contentType === 'post' ? `/post/${notif.contentId}` : `/project/${notif.contentId}`;
    navigate(path);
  };

  if (loading) {
    return (
      <motion.div className="main-container" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <MessagesPageSkeleton />
      </motion.div>
    );
  }

  return (
    <motion.div className="main-container" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Flex align="center" gap={8}>
          <Title level={2} style={{ margin: 0 }}>
            {t('messages.title')}
          </Title>
          <Button type="text" icon={<Settings size={18} />} onClick={() => setSettingsOpen(true)} />
        </Flex>
        {alertNotifications.some((n) => !n.isRead) && (
          <Button icon={<CheckCircle2 size={16} />} onClick={markAllAsRead}>
            {t('messages.markAllRead')}
          </Button>
        )}
      </div>

      {alertNotifications.length === 0 && silentNotifications.length === 0 ? (
        <Empty description={t('messages.empty')} />
      ) : (
        <>
          {alertNotifications.length > 0 && (
            <List
              className="card"
              itemLayout="horizontal"
              dataSource={alertNotifications}
              renderItem={(item) => {
                const notifTimeMs = toMillis(item.createdAt ?? item.createdat);
                return (
                  <List.Item
                    onClick={() => handleNotificationClick(item)}
                    style={{
                      cursor: 'pointer',
                      background: item.isRead ? 'transparent' : 'rgba(0, 122, 255, 0.03)',
                      padding: '16px 20px',
                      borderRadius: 12,
                      marginBottom: 8,
                      border: 'none',
                    }}
                    className="notification-item"
                  >
                    <List.Item.Meta
                      avatar={
                        <Badge dot={!item.isRead}>
                          <Avatar
                            icon={item.type === 'mention' ? <AtSign size={18} /> : <Heart size={18} />}
                            style={{
                              background: item.type === 'mention' ? 'var(--primary-color)' : '#ff4d4f',
                            }}
                          />
                        </Badge>
                      }
                      title={
                        <Space wrap>
                          <Text strong>{item.fromUserName}</Text>
                          <Text type="secondary">{t(`notify.feed.${item.type}`)}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {notifTimeMs != null ? dayjs(notifTimeMs).fromNow() : '—'}
                          </Text>
                        </Space>
                      }
                      description={
                        <div style={{ marginTop: 4, color: 'var(--text-main)', fontStyle: 'italic' }}>
                          "{item.commentText}"
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}

          {silentNotifications.length > 0 && (
            <Card style={{ marginTop: 12 }}>
              <Flex justify="space-between" align="center">
                <Text type="secondary">
                  {t('messages.foldedCount', { count: silentNotifications.length })}
                </Text>
                <Button size="small" onClick={() => setSilentOpen(true)}>
                  {t('messages.expand')}
                </Button>
              </Flex>
            </Card>
          )}
        </>
      )}

      <NotificationSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Modal
        title={t('messages.foldedTitle')}
        open={silentOpen}
        onCancel={() => setSilentOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <List
          itemLayout="horizontal"
          dataSource={silentNotifications}
          renderItem={(item) => {
            const notifTimeMs = toMillis(item.createdAt ?? item.createdat);
            return (
              <List.Item onClick={() => handleNotificationClick(item)} style={{ cursor: 'pointer' }}>
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Text strong>{item.fromUserName}</Text>
                      <Text type="secondary">{t(`notify.feed.${item.type}`)}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {notifTimeMs != null ? dayjs(notifTimeMs).fromNow() : '—'}
                      </Text>
                    </Space>
                  }
                  description={<Text type="secondary">{item.commentText}</Text>}
                />
              </List.Item>
            );
          }}
        />
      </Modal>
    </motion.div>
  );
};

export default Messages;
