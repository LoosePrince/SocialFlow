import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { apiJson } from '../lib/api';
import { subscribeAppEvents } from '../lib/appSse';

interface NotificationContextType {
  notifications: any[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const data = await apiJson<any[]>('/api/notifications');
      setNotifications(data);
      setUnreadCount(data.filter((n: any) => n.isAlert !== false && !n.isRead).length);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    void fetchNotifications();

    const unsub = subscribeAppEvents((data) => {
      if (data.table === 'notifications') {
        void fetchNotifications();
      }
    });

    return () => unsub();
  }, [user?.id]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, refresh: fetchNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotificationCenter = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotificationCenter must be used within a NotificationProvider');
  }
  return context;
};
