import React from 'react';
import { TabBar } from 'antd-mobile';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, PlusSquare, MessageCircle, User } from 'lucide-react';
import { theme, Grid } from 'antd';
import { useI18n } from '../context/I18nContext';

const { useBreakpoint } = Grid;

const MobileTabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const { t } = useI18n();

  const tabs = [
    { key: '/', title: t('tabs.home'), icon: <Home size={22} /> },
    { key: '/search', title: t('tabs.search'), icon: <Search size={22} /> },
    { key: '/create', title: t('tabs.create'), icon: <PlusSquare size={24} /> },
    { key: '/messages', title: t('tabs.messages'), icon: <MessageCircle size={22} /> },
    { key: '/profile', title: t('tabs.me'), icon: <User size={22} /> },
  ];

  if (screens.md) return null;

  return (
    <div style={{ 
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      zIndex: 1000,
      paddingBottom: 'env(safe-area-inset-bottom)',
      background: token.colorBgContainer,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: `1px solid ${token.colorBorderSecondary}`,
    }}>
      <TabBar 
        activeKey={location.pathname} 
        onChange={value => navigate(value)}
      >
        {tabs.map(item => (
          <TabBar.Item 
            key={item.key} 
            icon={item.icon} 
            title={item.title}
          />
        ))}
      </TabBar>
    </div>
  );
};

export default MobileTabBar;
