import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useFeeds } from '../hooks/useFeeds';
import PostCard from '../components/PostCard';
import ProjectCard from '../components/ProjectCard';
import { Typography, Space, Divider, Empty, Flex, theme, Card, Button, Grid } from 'antd';
import { ProfilePageSkeleton } from '../components/PageSkeletons';
import { GithubCdnAvatar } from '../components/GithubCdnAvatar';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useUsers } from '../hooks/useUsers';
import { Settings } from 'lucide-react';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const Profile: React.FC = () => {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, profile: currentProfile, loading: authLoading } = useAuth();
  const { users } = useUsers();
  const { feeds, loading: feedsLoading } = useFeeds(true);
  const { token } = theme.useToken();
  const screens = useBreakpoint();

  const targetUid = uid || currentUser?.id;
  const isOwnProfile = targetUid === currentUser?.id;
  
  const displayProfile = isOwnProfile ? currentProfile : users.find(u => u.uid === targetUid);
  const userFeeds = feeds.filter(f => f.authorid === targetUid);

  if (authLoading || feedsLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ maxWidth: 680, margin: '0 auto' }}
      >
        <ProfilePageSkeleton />
      </motion.div>
    );
  }

  if (!displayProfile) return <div><Empty description="未找到该用户" /></div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 680, margin: '0 auto' }}
    >
      <Card 
        variant="borderless"
        style={{ 
          marginBottom: 24, 
          boxShadow: token.boxShadow,
          borderRadius: token.borderRadiusLG,
          overflow: 'hidden',
          position: 'relative',
        }}
        styles={{ body: { padding: 0 } }}
      >
        {isOwnProfile && !screens.md && (
          <Button
            type="text"
            icon={<Settings size={22} strokeWidth={2} />}
            onClick={() => navigate('/settings')}
            aria-label="设置"
            style={{ position: 'absolute', top: 12, right: 8, zIndex: 1 }}
          />
        )}
        <Flex vertical align="center" style={{ padding: '32px 24px 24px', textAlign: 'center' }}>
          <GithubCdnAvatar 
            src={displayProfile.photourl} 
            size={100} 
            style={{ 
              marginBottom: 16, 
              border: `4px solid ${token.colorBgContainer}`,
              boxShadow: token.boxShadowSecondary
            }} 
          />
          <Title level={2} style={{ marginBottom: 4 }}>{displayProfile.displayname}</Title>
          <Text type="secondary">{displayProfile.email}</Text>
          <Flex gap={16} align="center" style={{ marginTop: 16 }}>
             <Space split={<Divider type="vertical" />}>
                <Text><b>{userFeeds.length}</b> 发布</Text>
                <Text><b>{displayProfile.role === 'admin' ? '管理员' : '普通用户'}</b></Text>
             </Space>
          </Flex>
        </Flex>
      </Card>

      <div style={{ marginTop: 32 }}>
        <Title level={4} style={{ marginBottom: 20 }}>发布的内容</Title>
        {userFeeds.length === 0 ? (
          <Empty description="还没有发布过内容" />
        ) : (
          userFeeds.map(item => (
            <div key={item.id}>
               {item.type === 'post' ? (
                 <PostCard post={item} onLike={() => {}} onComment={() => {}} />
               ) : (
                 <ProjectCard project={item} />
               )}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};

export default Profile;
