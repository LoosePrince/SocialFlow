import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeeds } from '../hooks/useFeeds';
import PostCard from '../components/PostCard';
import ProjectCard from '../components/ProjectCard';
import { Empty, App } from 'antd';
import { motion } from 'framer-motion';
import { HomeFeedSkeleton } from '../components/PageSkeletons';
import { useAuth } from '../context/AuthContext';
import { useLoginModal } from '../context/LoginModalContext';
import { toggleLike } from '../utils';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openLoginModal } = useLoginModal();
  const { feeds, loading } = useFeeds();
  const { message } = App.useApp();

  const handleLike = async (id: string, type: 'post' | 'project') => {
    if (!user) {
      openLoginModal();
      return;
    }
    try {
      await toggleLike(id, type);
    } catch (e) {
      message.error('操作失败');
    }
  };

  const handleComment = (id: string) => {
    navigate(`/post/${id}`);
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
    <motion.div 
      className="home-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {feeds.length === 0 ? (
        <Empty description="暂无动态" style={{ marginTop: 100 }} />
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
  );
};

export default Home;
