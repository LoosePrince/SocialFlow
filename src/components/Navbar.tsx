import { Badge, Button, Dropdown, Flex, Grid, Input, MenuProps, Typography, theme } from 'antd';
import { Bell, LogOut, PlusCircle, Search, Settings, User as UserIcon } from 'lucide-react';
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotificationCenter } from '../context/NotificationContext';
import CreateModal from './CreateModal';
import { GithubCdnAvatar } from './GithubCdnAvatar';

const { Text } = Typography;
const { useBreakpoint } = Grid;

const Navbar: React.FC = () => {
  const { user, profile, logout } = useAuth();
  const { unreadCount } = useNotificationCenter();
  const [createVisible, setCreateVisible] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const screens = useBreakpoint();

  const items: MenuProps['items'] = [
    {
      key: 'profile',
      label: '个人主页',
      icon: <UserIcon size={16} />,
      onClick: () => navigate('/profile'),
    },
    {
      key: 'settings',
      label: '设置',
      icon: <Settings size={16} />,
      onClick: () => navigate('/settings'),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogOut size={16} />,
      onClick: logout,
      danger: true,
    },
  ];

  return (
    <nav style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      height: 64,
      zIndex: 1000,
      background: token.colorBgContainer,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${token.colorBorderSecondary}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <Flex
        justify="space-between"
        align="center"
        style={{
          width: '100%',
          maxWidth: 1200,
          padding: '0 20px',
          height: '100%'
        }}
      >
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <img
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            style={{ display: 'block', objectFit: 'contain', borderRadius: 5 }}
          />
          <Text strong style={{ fontSize: 22, letterSpacing: -0.5 }}>
            Social<span style={{ color: token.colorPrimary }}>Flow</span>
          </Text>
        </Link>

        {screens.md && (
          <div style={{ flex: 1, maxWidth: 400, margin: '0 40px' }}>
            <Input
              readOnly
              prefix={<Search size={16} style={{ color: token.colorTextDescription }} />}
              placeholder="搜索动态、项目或用户..."
              variant="filled"
              style={{ borderRadius: 20, height: 36, background: token.colorBgLayout, cursor: 'pointer' }}
              onClick={() => navigate('/search')}
            />
          </div>
        )}

        <Flex align="center" gap={16}>
          {user && (
            <>
              {screens.md && (
                <Badge count={unreadCount} size="small" offset={[-2, 4]}>
                  <Button
                    type="text"
                    icon={<Bell size={20} />}
                    onClick={() => navigate('/messages')}
                  />
                </Badge>
              )}
              {screens.md && (
                <Button
                  type="text"
                  icon={<PlusCircle size={20} />}
                  onClick={() => setCreateVisible(true)}
                >
                  发布
                </Button>
              )}
            </>
          )}

          {user ? (
            screens.md ? (
              <Dropdown menu={{ items }} placement="bottomRight" arrow>
                <Flex align="center" gap={10} style={{
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 20,
                }}>
                  <GithubCdnAvatar src={profile?.photourl} size="default" />
                  <Text strong style={{ fontSize: 14 }}>{profile?.displayname}</Text>
                </Flex>
              </Dropdown>
            ) : (
              <Link
                to="/profile"
                aria-label="个人主页"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 4px 4px 8px',
                  borderRadius: 20,
                  color: 'inherit',
                }}
              >
                <GithubCdnAvatar src={profile?.photourl} size="default" />
              </Link>
            )
          ) : (
            <Button
              type="primary"
              onClick={() =>
                navigate(`/login?from=${encodeURIComponent(location.pathname + location.search)}`)
              }
              shape="round"
            >
              登录
            </Button>
          )}
        </Flex>
      </Flex>
      <CreateModal visible={createVisible} onCancel={() => setCreateVisible(false)} />
    </nav>
  );
};

export default Navbar;
