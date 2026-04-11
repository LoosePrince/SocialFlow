import React from 'react';
import { List, Avatar, Typography, Badge, Button, Empty, Space } from 'antd';
import { NotificationsPageSkeleton } from '../components/PageSkeletons';
import { AtSign, MessageCircle, Heart, CheckCircle2 } from 'lucide-react';
import { useNotificationCenter } from '../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { motion } from 'framer-motion';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');
import { apiJson } from '../lib/api';
import { toMillis } from '../lib/time';

const { Title, Text } = Typography;

const Notifications: React.FC = () => {
  const { notifications, loading, refresh } = useNotificationCenter();
  const { user } = useAuth();
  const navigate = useNavigate();

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
        <NotificationsPageSkeleton />
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="main-container"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>通知中心</Title>
        {notifications.some(n => !n.isRead) && (
          <Button icon={<CheckCircle2 size={16} />} onClick={markAllAsRead}>全部已读</Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Empty description="暂无通知" />
      ) : (
        <List
          className="card"
          itemLayout="horizontal"
          dataSource={notifications}
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
                border: 'none'
              }}
              className="notification-item"
            >
              <List.Item.Meta
                avatar={
                  <Badge dot={!item.isRead}>
                    <Avatar 
                      icon={item.type === 'mention' ? <AtSign size={18}/> : <Heart size={18}/>} 
                      style={{ background: item.type === 'mention' ? 'var(--primary-color)' : '#ff4d4f' }}
                    />
                  </Badge>
                }
                title={
                  <Space>
                    <Text strong>{item.fromUserName}</Text>
                    <Text type="secondary">在评论中艾特了你</Text>
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
    </motion.div>
  );
};

export default Notifications;
