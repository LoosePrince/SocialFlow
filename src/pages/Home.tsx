import React, { useState } from 'react';
import { useFeeds } from '../hooks/useFeeds';
import PostCard from '../components/PostCard';
import ProjectCard from '../components/ProjectCard';
import { Empty, App, Modal } from 'antd';
import { motion } from 'framer-motion';
import { HomeFeedSkeleton } from '../components/PageSkeletons';
import { useAuth } from '../context/AuthContext';
import { useLoginModal } from '../context/LoginModalContext';
import { useI18n } from '../context/I18nContext';
import { toggleLike } from '../utils';
import CommentSection from '../components/CommentSection';

const Home: React.FC = () => {
  const { user } = useAuth();
  const { openLoginModal } = useLoginModal();
  const { feeds, loading } = useFeeds();
  const { message } = App.useApp();
  const { t } = useI18n();
  const [quickCommentPostId, setQuickCommentPostId] = useState<string | null>(null);

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
      >
        {feeds.length === 0 ? (
          <Empty description={t('home.empty')} style={{ marginTop: 100 }} />
        ) : (
          feeds.map((item) => (
            <div key={item.id}>
              {item.type === 'post' ? (
                <PostCard post={item} onLike={(id) => handleLike(id, 'post')} onComment={handleComment} />
              ) : (
                <ProjectCard project={item} />
              )}
            </div>
          ))
        )}
      </motion.div>

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
    </>
  );
};

export default Home;
