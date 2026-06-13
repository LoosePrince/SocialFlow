import React, { useState } from 'react';
import { useFeeds } from '../hooks/useFeeds';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import PostCard from '../components/PostCard';
import ProjectCard from '../components/ProjectCard';
import { App, Drawer, Grid, Modal, Spin, Typography } from 'antd';
import { motion } from 'framer-motion';
import { HomeFeedSkeleton } from '../components/PageSkeletons';
import { useAuth } from '../context/AuthContext';
import { useLoginModal } from '../context/LoginModalContext';
import { useI18n } from '../context/I18nContext';
import { toggleLike } from '../utils';
import CommentSection from '../components/CommentSection';
import FeedFilter, { FeedFilterValue } from '../components/FeedFilter';
import ActionEmpty from '../components/ActionEmpty';

const { useBreakpoint } = Grid;
const { Text } = Typography;

const Home: React.FC = () => {
  const { user } = useAuth();
  const { openLoginModal } = useLoginModal();
  const { message } = App.useApp();
  const { t } = useI18n();
  const screens = useBreakpoint();
  const [quickCommentPostId, setQuickCommentPostId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilterValue>('all');
  const { feeds, loading, loadingMore, hasMore, loadMore } = useFeeds({ type: feedFilter });
  const loadMoreRef = useInfiniteScroll({
    loading: loading || loadingMore,
    hasMore,
    onLoadMore: loadMore,
  });

  const emptyDescription =
    feedFilter === 'post'
      ? t('feed.emptyPosts')
      : feedFilter === 'project'
        ? t('feed.emptyProjects')
        : t('home.emptyAll');

  const handleLike = async (id: string, type: 'post' | 'project') => {
    if (!user) {
      openLoginModal();
      return;
    }
    try {
      await toggleLike(id, type);
    } catch {
      message.error(t('home.actionFailed'));
    }
  };

  const handleComment = (id: string) => {
    setQuickCommentPostId(id);
  };

  if (loading) {
    return (
      <motion.div
        className="home-page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ marginInline: screens.md ? 0 : -16 }}
      >
        <HomeFeedSkeleton />
      </motion.div>
    );
  }

  return (
    <>
      <motion.div 
        className="home-page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ marginInline: screens.md ? 0 : -16 }}
      >
        <FeedFilter value={feedFilter} onChange={setFeedFilter} sticky />
        {feeds.length === 0 ? (
          <ActionEmpty title={emptyDescription} description={t('home.emptyHint')} />
        ) : (
          <>
            {feeds.map((item) => (
              <div key={`${item.type}-${item.id}`}>
                {item.type === 'post' ? (
                  <PostCard post={item} onLike={(id) => handleLike(id, 'post')} onComment={handleComment} />
                ) : (
                  <ProjectCard project={item} />
                )}
              </div>
            ))}
            <div ref={loadMoreRef} style={{ minHeight: 32, padding: 16, textAlign: 'center' }}>
              {loadingMore ? <Spin /> : hasMore ? <Text type="secondary">加载更多</Text> : null}
            </div>
          </>
        )}
      </motion.div>

      {screens.md ? (
        <Modal
          title={t('home.quickComment')}
          open={quickCommentPostId !== null}
          onCancel={() => setQuickCommentPostId(null)}
          footer={null}
          destroyOnHidden
          width={720}
        >
          {quickCommentPostId && (
            <CommentSection contentId={quickCommentPostId} contentType="post" />
          )}
        </Modal>
      ) : (
        <Drawer
          title={t('home.quickComment')}
          open={quickCommentPostId !== null}
          onClose={() => setQuickCommentPostId(null)}
          placement="bottom"
          height="78vh"
          destroyOnHidden
          styles={{
            body: { padding: 16 },
            content: { borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
          }}
        >
          {quickCommentPostId && (
            <CommentSection contentId={quickCommentPostId} contentType="post" />
          )}
        </Drawer>
      )}
    </>
  );
};

export default Home;
