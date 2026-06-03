import React, { useMemo, useState } from 'react';
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
import { useI18n } from '../context/I18nContext';
import FeedFilter, { FeedFilterValue } from '../components/FeedFilter';

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
  const { t } = useI18n();
  const [feedFilter, setFeedFilter] = useState<FeedFilterValue>('all');

  const targetUid = uid || currentUser?.id;
  const isOwnProfile = targetUid === currentUser?.id;
  
  const displayProfile = isOwnProfile ? currentProfile : users.find(u => u.uid === targetUid);
  const userFeeds = useMemo(
    () => feeds.filter((item) => item.authorid === targetUid),
    [feeds, targetUid]
  );
  const visibleFeeds = useMemo(() => {
    if (feedFilter === 'all') return userFeeds;
    return userFeeds.filter((item) => item.type === feedFilter);
  }, [feedFilter, userFeeds]);

  const emptyDescription =
    userFeeds.length === 0
      ? t('profile.empty')
      : feedFilter === 'post'
        ? t('profile.emptyPosts')
        : feedFilter === 'project'
          ? t('profile.emptyProjects')
          : t('profile.empty');

  if (authLoading || feedsLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ maxWidth: 680, margin: '0 auto', marginInline: screens.md ? 0 : -16 }}
      >
        <ProfilePageSkeleton />
      </motion.div>
    );
  }

  if (!displayProfile) return <div><Empty description={t('profile.notFound')} /></div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 680, margin: '0 auto', marginInline: screens.md ? 0 : -16 }}
    >
      <Card 
        variant="borderless"
        style={{ 
          marginBottom: screens.md ? 24 : 12,
          boxShadow: screens.md ? token.boxShadow : 'none',
          borderRadius: screens.md ? token.borderRadiusLG : 0,
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
            aria-label={t('nav.settings')}
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
                <Text><b>{userFeeds.length}</b> {t('profile.published')}</Text>
                <Text><b>{displayProfile.role === 'admin' ? t('profile.roleAdmin') : t('profile.roleUser')}</b></Text>
             </Space>
          </Flex>
        </Flex>
      </Card>

      <div style={{ marginTop: screens.md ? 32 : 20 }}>
        <Title level={4} style={{ marginBottom: 14, paddingInline: screens.md ? 0 : 16 }}>
          {t('profile.publishedContent')}
        </Title>
        <FeedFilter value={feedFilter} onChange={setFeedFilter} />
        {visibleFeeds.length === 0 ? (
          <div style={{ paddingInline: screens.md ? 0 : 16 }}>
            <Empty description={emptyDescription} />
          </div>
        ) : (
          visibleFeeds.map(item => (
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
