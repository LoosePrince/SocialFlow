import React from 'react';
import { TabBar } from 'antd-mobile';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, PlusSquare, MessageCircle, User } from 'lucide-react';
import { theme, Grid } from 'antd';

const { useBreakpoint } = Grid;

const MobileTabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const screens = useBreakpoint();

  const tabs = [
    { key: '/', title: '首页', icon: <Home size={22} /> },
    { key: '/search', title: '探索', icon: <Search size={22} /> },
    { key: '/create', title: '发布', icon: <PlusSquare size={24} /> },
    { key: '/messages', title: '消息', icon: <MessageCircle size={22} /> },
    { key: '/profile', title: '我', icon: <User size={22} /> },
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
