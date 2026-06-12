import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiJson, onApiCacheUpdate } from '../lib/api';
import { Typography, Button, Card, theme, Flex, Grid } from 'antd';
import { PostDetailPageSkeleton } from '../components/PageSkeletons';
import { GithubCdnAvatar } from '../components/GithubCdnAvatar';
import SmartFeedImage from '../components/SmartFeedImage';
import { Clock, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { getGithubUrl } from '../github';
import CommentSection from '../components/CommentSection';
import DetailPageToolbar from '../components/DetailPageToolbar';
import PostBodyDisplay from '../components/PostBodyDisplay';
import AttachmentList from '../components/AttachmentList';
import dayjs from 'dayjs';
import { toMillis } from '../lib/time';
import { motion } from 'framer-motion';
import type { FileAsset } from '../lib/files';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type PostDetailData = {
  profiles?: { displayname?: string; photourl?: string };
  images?: string[];
  fileattachments?: FileAsset[];
};

function normalizePost(data: PostDetailData) {
  const authorPhoto = data.profiles?.photourl || '';
  return {
    ...data,
    authorName: data.profiles?.displayname,
    authorPhoto: getGithubUrl(authorPhoto),
    images: ((data.images as string[]) || []).map(getGithubUrl),
    fileattachments: data.fileattachments ?? [],
  };
}

const PostDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const canEditPost = post && (isAdmin || user?.id === post.authorid);

  useEffect(() => {
    const path = id ? `/api/posts/${id}` : '';
    const fetchPost = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiJson<PostDetailData>(path);
        setPost(normalizePost(data));
      } catch {
        setPost(null);
      }
      setLoading(false);
    };

    void fetchPost();
    if (!path) return undefined;
    const unsubCache = onApiCacheUpdate<PostDetailData>(path, (data) => {
      setPost(normalizePost(data));
      setLoading(false);
    });
    return () => unsubCache();
  }, [id]);

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 680, margin: '0 auto' }}>
        <PostDetailPageSkeleton />
      </motion.div>
    );
  }
  if (!post) return <div style={{ padding: 24, textAlign: 'center' }}><Text type="secondary">{t('post.notFound')}</Text></div>;

  const postTimeMs = toMillis(post.createdat ?? post.createdAt);
  const nonImageAttachments = ((post.fileattachments as FileAsset[] | undefined) ?? []).filter(
    (asset) => asset.kind !== 'image'
  );
  const isMobile = !screens.md;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        maxWidth: 680,
        margin: '0 auto',
        background: isMobile ? token.colorBgContainer : undefined,
      }}
    >
      <DetailPageToolbar
        backLabel={t('detail.back')}
        onBack={() => navigate(-1)}
        editAction={
          canEditPost ? (
            <Button
              type="text"
              icon={<Pencil size={16} strokeWidth={2} />}
              onClick={() => navigate(`/create?edit=${encodeURIComponent(post.id)}&type=post`)}
              style={{ color: token.colorTextSecondary }}
            >
              {t('detail.edit')}
            </Button>
          ) : undefined
        }
      />
      
      <Card
        variant="borderless"
        style={{ 
          boxShadow: screens.md ? 'var(--sf-subtle-shadow)' : 'none',
          borderRadius: screens.md ? token.borderRadiusLG : 0,
          background: token.colorBgContainer,
          border: isMobile ? 'none' : undefined,
          marginBottom: screens.md ? 24 : 0,
        }}
        styles={{ body: { padding: screens.md ? 32 : 16 } }}
      >
        <Flex align="start" gap={16} style={{ marginBottom: 24 }}>
          <GithubCdnAvatar 
            src={post.authorPhoto} 
            size={48} 
            onClick={() => navigate(`/profile/${post.authorid}`)} 
            style={{ cursor: 'pointer' }}
          />
          <Flex vertical>
            <Title 
              level={4} 
              style={{ margin: 0, cursor: 'pointer' }} 
              onClick={() => navigate(`/profile/${post.authorid}`)}
            >
              {post.authorName}
            </Title>
            <Flex align="center" gap={4} style={{ marginTop: 4 }}>
              <Clock size={12} style={{ color: token.colorTextDescription }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {postTimeMs != null ? dayjs(postTimeMs).format('YYYY-MM-DD HH:mm') : '—'}
              </Text>
            </Flex>
          </Flex>
        </Flex>

        <div style={{ marginBottom: 24 }}>
          <PostBodyDisplay text={post.content ?? ''} fontSize={screens.md ? 18 : 16} />
        </div>
        
        {post.images && post.images.length > 0 && (
          <Flex
            vertical
            gap={isMobile ? 0 : 12}
            style={isMobile ? { margin: '0 -16px' } : undefined}
          >
            {post.images.map((img: string, idx: number) => (
              <div
                key={idx}
                style={
                  isMobile
                    ? { overflow: 'hidden' }
                    : {
                        boxShadow: token.boxShadowSecondary,
                        borderRadius: token.borderRadius,
                        overflow: 'hidden',
                      }
                }
              >
                <SmartFeedImage
                  src={img}
                  alt=""
                  layout="stacked"
                  preview={{}}
                  style={{ borderRadius: isMobile ? 0 : token.borderRadius }}
                />
              </div>
            ))}
          </Flex>
        )}
        <AttachmentList attachments={nonImageAttachments} />
      </Card>

      <CommentSection contentId={post.id} contentType="post" embedded />
    </motion.div>
  );
};

export default PostDetail;
