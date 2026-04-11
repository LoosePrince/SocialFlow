import React, { useState, useEffect, useCallback } from 'react';
import { Space, Button, Popover, App, Flex, Typography, theme, Card, Modal } from 'antd';
import { GithubCdnAvatar } from './GithubCdnAvatar';
import { GithubCdnAntImage } from './GithubCdnAntImage';
import { Heart, MessageCircle, Share2, MoreHorizontal, ShieldCheck, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import LikeList from './LikeList';
import CommentPreview from './CommentPreview';
import { useAuth } from '../context/AuthContext';
import { apiJson } from '../lib/api';
import { toMillis } from '../lib/time';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Text, Paragraph } = Typography;

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
  const { token } = theme.useToken();
  const images = post.images || [];
  const displayImages = images.slice(0, 9);
  const remainingCount = images.length - 9;
  const { message, modal } = App.useApp();

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
      message.success(data.isrecommended ? '已推荐到首页' : '已取消推荐');
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = () => {
    modal.confirm({
      title: '确定要删除这条动态吗？',
      content: '删除后无法恢复',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiJson(`/api/posts/${post.id}`, { method: 'DELETE' });
          message.success('已删除');
        } catch {
          message.error('删除失败');
        }
      }
    });
  };

  return (
    <Card 
      style={{ 
        marginBottom: 16,
        background: token.colorBgContainer,
        boxShadow: token.boxShadow,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
      }}
      styles={{ body: { padding: 20 } }}
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
                {isAdmin && (
                  <Button type="text" onClick={toggleRecommendation} style={{ textAlign: 'left' }}>
                    {post.isrecommended ? '取消推荐' : '推荐到首页'}
                  </Button>
                )}
                <Button type="text" danger onClick={handleDelete} icon={<Trash2 size={14}/>} style={{ textAlign: 'left' }}>
                  删除内容
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
        aria-label="查看动态详情"
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
        <Paragraph
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            marginBottom: 12,
            whiteSpace: 'pre-wrap',
            color: token.colorText,
          }}
        >
          {post.content}
        </Paragraph>

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
            }}
          >
            {displayImages.map((img: string, idx: number) => (
              <div
                key={idx}
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  overflow: 'hidden',
                  borderRadius: 8,
                  background: token.colorBgLayout,
                }}
              >
                <GithubCdnAntImage
                  src={img}
                  alt={`post-img-${idx}`}
                  preview={{ mask: null }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                {idx === 8 && remainingCount > 0 && (
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
                    }}
                  >
                    +{remainingCount}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12 }}>
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
            style={{ color: token.colorTextDescription }} 
          />
        </Flex>
        
        <LikeList contentId={post.id} contentType="post" refreshNonce={likeListNonce} />
        <CommentPreview contentId={post.id} />
      </div>
    </Card>
  );
};

export default PostCard;
