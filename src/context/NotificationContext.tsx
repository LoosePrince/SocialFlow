import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './AuthContext';

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
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('touserid', user.id)
      .order('createdat', { ascending: false });

    if (!error && data) {
      setNotifications(data);
      setUnreadCount(data.filter((n: any) => !n.isread).length);
    }
    setLoading(false);
  };

  useEffect(() => {
    // 只有登录后才开启订阅
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    fetchNotifications();

    // 全局唯一的订阅通道
    const channel = supabase
      .channel(`global-notifications-${user.id}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'notifications', filter: `touserid=eq.${user.id}` }, 
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]); // 仅在用户 ID 变化时重连

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
