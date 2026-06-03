import React, { useState, useEffect, useCallback } from 'react';
import { Space, Button, Popover, App, Flex, Typography, theme, Card, Modal, Input, Grid } from 'antd';
import { GithubCdnAvatar } from './GithubCdnAvatar';
import SmartFeedImage from './SmartFeedImage';
import { Heart, MessageCircle, Share2, MoreHorizontal, ShieldCheck, Trash2, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import LikeList from './LikeList';
import CommentPreview from './CommentPreview';
import PostBodyDisplay from './PostBodyDisplay';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { apiJson } from '../lib/api';
import { toMillis } from '../lib/time';

const { Text } = Typography;
const { useBreakpoint } = Grid;

interface PostCardProps {
  post: any;
  onLike: (id: string) => void | Promise<void>;
  onComment: (id: string) => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, onLike, onComment }) => {
  const [likeListNonce, setLikeListNonce] = useState(0);
  const [liked, setLiked] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const images = post.images || [];
  const maxVisibleImages = screens.md ? 9 : 3;
  const displayImages = images.slice(0, maxVisibleImages);
  const remainingCount = Math.max(0, images.length - maxVisibleImages);
  const { message, modal } = App.useApp();
  const [shareOpen, setShareOpen] = useState(false);

  const isOwner = user?.id === post.authorid;
  const canManage = isAdmin || isOwner;
  const createdAtMs = toMillis(post.createdat ?? post.createdAt);

  const fetchUserLiked = useCallback(async () => {
    if (!user) {
      setLiked(false);
      return;
    }
    try {
      const status = await apiJson<{ liked: boolean }>(
        `/api/likes/status?contentId=${encodeURIComponent(post.id)}`
      );
      setLiked(!!status.liked);
    } catch {
      setLiked(false);
    }
  }, [user?.id, post.id]);

  useEffect(() => {
    fetchUserLiked();
  }, [fetchUserLiked, likeListNonce]);

  const toggleRecommendation = async () => {
    try {
      const data = await apiJson<{ isrecommended?: boolean }>(`/api/posts/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isrecommended: !post.isrecommended }),
      });
      message.success(data.isrecommended ? t('post.recommendSuccessOn') : t('post.recommendSuccessOff'));
    } catch {
      message.error(t('post.actionFailed'));
    }
  };

  const handleDelete = () => {
    modal.confirm({
      title: t('post.deleteConfirmTitle'),
      content: t('post.deleteConfirmContent'),
      okText: t('post.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await apiJson(`/api/posts/${post.id}`, { method: 'DELETE' });
          message.success(t('post.deleted'));
        } catch {
          message.error(t('post.deleteFailed'));
        }
      }
    });
  };

  const shareUrl = `${window.location.origin}/post/${post.id}`;
  const shareMailTo = `mailto:?subject=${encodeURIComponent(`${t('share.postTitle')}：${post.authorName ?? ''}`)}&body=${encodeURIComponent(shareUrl)}`;

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      message.success(t('share.linkCopied'));
    } catch {
      message.error(t('share.copyFailed'));
    }
  };

  return (
    <Card 
      style={{ 
        marginBottom: screens.md ? 16 : 0,
        background: token.colorBgContainer,
        boxShadow: screens.md ? token.boxShadow : 'none',
        border: screens.md ? `1px solid ${token.colorBorderSecondary}` : 'none',
        borderBottom: screens.md ? undefined : `1px solid ${token.colorBorderSecondary}`,
        borderRadius: screens.md ? token.borderRadiusLG : 0,
      }}
      styles={{ body: { padding: screens.md ? 20 : 16 } }}
    >
      {/* Header */}
      <Flex justify="space-between" align="start" style={{ marginBottom: 12 }}>
        <Space size="middle" onClick={() => navigate(`/profile/${post.authorid}`)} style={{ cursor: 'pointer' }}>
          <GithubCdnAvatar src={post.authorPhoto} size="large" />
          <Flex vertical>
            <Text strong style={{ fontSize: 15, lineHeight: 1.2 }}>{post.authorName}</Text>
            <Flex align="center" gap={8} style={{ marginTop: 2 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {createdAtMs != null ? dayjs(createdAtMs).fromNow() : '—'}
              </Text>
              {post.isrecommended && <ShieldCheck size={14} style={{ color: token.colorPrimary }} />}
            </Flex>
          </Flex>
        </Space>
        {canManage && (
          <Popover 
            placement="bottomRight"
            content={
              <Flex vertical gap={4}>
                <Button
                  type="text"
                  icon={<Pencil size={14} />}
                  style={{ textAlign: 'left' }}
                  onClick={() => navigate(`/create?edit=${encodeURIComponent(post.id)}&type=post`)}
                >
                  {t('post.edit')}
                </Button>
                {isAdmin && (
                  <Button
                    type="text"
                    icon={<ShieldCheck size={14} />}
                    onClick={toggleRecommendation}
                    style={{ textAlign: 'left' }}
                  >
                    {post.isrecommended ? t('post.recommendOff') : t('post.recommendOn')}
                  </Button>
                )}
                <Button type="text" danger onClick={handleDelete} icon={<Trash2 size={14}/>} style={{ textAlign: 'left' }}>
                  {t('post.delete')}
                </Button>
              </Flex>
            } 
            trigger="click"
          >
             <Button type="text" icon={<MoreHorizontal size={18} />} />
          </Popover>
        )}
      </Flex>

      {/* 正文 + 右侧留白整宽可点进详情；九宫格内点击保留图片预览 */}
      <div
        role="link"
        tabIndex={0}
        aria-label={t('post.viewDetail')}
        onClick={() => navigate(`/post/${post.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/post/${post.id}`);
          }
        }}
        style={{
          marginBottom: 16,
          width: '100%',
          cursor: 'pointer',
          borderRadius: token.borderRadiusSM,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <PostBodyDisplay
            text={post.content ?? ''}
            fontSize={16}
            collapsibleRows={6}
            preventOuterClick
          />
        </div>

        {images.length > 0 && (
          <div
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 4,
              width: '100%',
              maxWidth: 400,
              cursor: 'default',
              alignItems: 'start',
            }}
          >
            {displayImages.map((img: string, idx: number) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  width: '100%',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    maxWidth: '100%',
                    lineHeight: 0,
                  }}
                >
                  <SmartFeedImage
                    src={img}
                    alt={`post-img-${idx}`}
                    layout="gridCell"
                    preview={{ mask: null }}
                  />
                  {idx === displayImages.length - 1 && remainingCount > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.4)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        fontWeight: 600,
                        pointerEvents: 'none',
                        borderRadius: token.borderRadius,
                      }}
                    >
                      +{remainingCount}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: screens.md ? `1px solid ${token.colorBorderSecondary}` : 'none', paddingTop: screens.md ? 12 : 0 }}>
        <Flex gap={16}>
          <Button 
            type="text" 
            icon={
              <Heart
                size={18}
                style={{
                  color: liked ? token.colorPrimary : token.colorTextDescription,
                  fill: liked ? token.colorPrimary : 'transparent',
                }}
              />
            }
            onClick={async () => {
              await Promise.resolve(onLike(post.id));
              setLikeListNonce((n) => n + 1);
            }}
            style={{ 
              color: liked ? token.colorPrimary : token.colorTextDescription,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
            }}
          >
            {(post.likecount ?? post.likeCount) || 0}
          </Button>
          <Button 
            type="text" 
            icon={<MessageCircle size={18} />} 
            onClick={() => onComment(post.id)}
            style={{ 
              color: token.colorTextDescription,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px'
            }}
          >
            {(post.commentcount ?? post.commentCount) || 0}
          </Button>
          <Button 
            type="text" 
            icon={<Share2 size={18} />} 
            onClick={() => setShareOpen(true)}
            style={{ color: token.colorTextDescription }} 
          />
        </Flex>
        
        {screens.md && <LikeList contentId={post.id} contentType="post" refreshNonce={likeListNonce} />}
        <CommentPreview contentId={post.id} contentType="post" maxItems={screens.md ? 5 : 2} />
      </div>

      <Modal
        title={t('share.postTitle')}
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Flex vertical gap={12}>
          <Input value={shareUrl} readOnly />
          <Flex gap={8}>
            <Button type="primary" onClick={() => void handleCopyShareLink()}>
              {t('share.copyLink')}
            </Button>
            <Button href={shareMailTo}>
              {t('share.byEmail')}
            </Button>
          </Flex>
        </Flex>
      </Modal>
    </Card>
  );
};

export default PostCard;
