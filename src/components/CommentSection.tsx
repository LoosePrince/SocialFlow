import React, { useState, useEffect, useCallback } from 'react';
import { Button, List, Space, Modal, App, Mentions, Flex, Typography, theme } from 'antd';
import { GithubCdnAvatar } from './GithubCdnAvatar';
import LikeList from './LikeList';
import { useNavigate } from 'react-router-dom';
import { Send, MessageSquare, MessageCircle, Trash2, Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { getGithubUrl } from '../github';
import { toggleLike } from '../utils';
import CommentText from './CommentText';
import dayjs from 'dayjs';
import { apiJson } from '../lib/api';
import { subscribeAppEvents } from '../lib/appSse';
import { toMillis } from '../lib/time';

const { Text } = Typography;

function relativeFromNow(v: unknown) {
  const ms = toMillis(v);
  return ms != null ? dayjs(ms).fromNow() : '—';
}

interface CommentSectionProps {
  contentId: string;
  contentType: 'post' | 'project';
}

const CommentSection: React.FC<CommentSectionProps> = ({ contentId, contentType }) => {
  const { user, profile, isAdmin } = useAuth();
  const { token } = theme.useToken();
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeListNonce, setLikeListNonce] = useState(0);
  const { users } = useUsers();
  const { message, modal } = App.useApp();

  const navigate = useNavigate();

  const fetchLikeMeta = useCallback(async () => {
    const path =
      contentType === 'post' ? `/api/posts/${contentId}` : `/api/projects/${contentId}`;
    try {
      const row = await apiJson<{ likecount?: number }>(path);
      setLikeCount(row.likecount ?? 0);
    } catch {
      setLikeCount(0);
    }
    try {
      const status = await apiJson<{ liked: boolean }>(
        `/api/likes/status?contentId=${encodeURIComponent(contentId)}`
      );
      setLiked(!!status.liked);
    } catch {
      setLiked(false);
    }
  }, [contentId, contentType]);

  useEffect(() => {
    void fetchLikeMeta();
  }, [fetchLikeMeta]);

  useEffect(() => {
    const unsub = subscribeAppEvents((data) => {
      const t = data.table as string | undefined;
      if (t === 'likes') {
        void fetchLikeMeta();
      }
    });
    return () => unsub();
  }, [fetchLikeMeta]);

  const handleLike = async () => {
    if (!user) {
      message.warning('请先登录后点赞');
      return;
    }
    try {
      await toggleLike(contentId, contentType);
      await fetchLikeMeta();
      setLikeListNonce((n) => n + 1);
    } catch {
      message.error('操作失败');
    }
  };

  const fetchComments = async () => {
    try {
      const data = await apiJson<
        Array<{
          id: string;
          authorid: string;
          text: string;
          createdat: number;
          parentid?: string | null;
          profiles?: { displayname?: string; photourl?: string };
        }>
      >(
        `/api/comments?contentId=${encodeURIComponent(contentId)}&contentType=${encodeURIComponent(contentType)}`
      );
      setComments(
        data.map((c) => ({
          ...c,
          authorName: c.profiles?.displayname,
          authorPhoto: c.profiles?.photourl
            ? c.profiles.photourl.startsWith('http')
              ? c.profiles.photourl
              : getGithubUrl(c.profiles.photourl)
            : '',
        }))
      );
    } catch {
      setComments([]);
    }
  };

  useEffect(() => {
    void fetchComments();
    const unsub = subscribeAppEvents((data) => {
      if (data.table === 'comments') {
        void fetchComments();
      }
    });
    return () => unsub();
  }, [contentId, contentType]);

  const handleSubmit = async () => {
    if (!user) {
      message.warning('请先登录后评论');
      return;
    }
    if (!text.trim()) return;

    setSubmitting(true);
    try {
      const mentionIds = users.filter((u) => text.includes(`@${u.displayname}`)).map((u) => u.uid);

      await apiJson('/api/comments', {
        method: 'POST',
        body: JSON.stringify({
          contentid: contentId,
          contenttype: contentType,
          text: text.trim(),
          parentid: replyTo ? replyTo.id : null,
          replytoname: replyTo ? replyTo.authorName : null,
          mentionids: mentionIds,
        }),
      });

      setText('');
      setReplyTo(null);
      message.success('评论成功');
      await fetchComments();
    } catch (err: any) {
      message.error(`评论失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    modal.confirm({
      title: '确定要删除这条评论吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiJson(`/api/comments/${commentId}`, { method: 'DELETE' });
          message.success('评论已删除');
          await fetchComments();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  return (
    <div style={{ background: token.colorBgContainer, borderRadius: token.borderRadiusLG, padding: 20 }}>
      <div
        style={{
          marginBottom: 20,
          paddingBottom: 20,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Button
          type="text"
          icon={
            <Heart
              size={20}
              style={{
                color: liked ? token.colorPrimary : token.colorTextDescription,
                fill: liked ? token.colorPrimary : 'transparent',
              }}
            />
          }
          onClick={handleLike}
          style={{
            color: liked ? token.colorPrimary : token.colorTextSecondary,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 0',
            height: 'auto',
            fontSize: 15,
            marginBottom: 8,
          }}
        >
          {likeCount}
        </Button>
        <LikeList contentId={contentId} contentType={contentType} alwaysShow refreshNonce={likeListNonce} />
      </div>

      <Flex align="center" gap={8} style={{ marginBottom: 20 }}>
        <MessageCircle size={18} />
        <Text strong style={{ fontSize: 16 }}>评论 · {comments.length}</Text>
      </Flex>

      <Flex gap={12} style={{ marginBottom: 24 }}>
        <GithubCdnAvatar src={profile?.photourl} size={40} style={{ flexShrink: 0 }} />
        <Flex vertical style={{ flex: 1 }}>
          {replyTo && (
            <Flex justify="space-between" align="center" style={{ 
              background: token.colorBgLayout, 
              padding: '4px 12px', 
              borderRadius: 8, 
              marginBottom: 8 
            }}>
              <Text style={{ fontSize: 12 }}>回复 <Text strong>@{replyTo.authorName}</Text></Text>
              <Button type="link" size="small" onClick={() => setReplyTo(null)}>取消</Button>
            </Flex>
          )}
          <Flex align="end" gap={8} style={{ 
            background: token.colorBgLayout, 
            borderRadius: 12, 
            padding: 8,
            border: `1px solid ${token.colorBorderSecondary}`
          }}>
            <Mentions
              placeholder="写下你的精彩评论..."
              autoSize={{ minRows: 1, maxRows: 6 }}
              value={text}
              onChange={(val) => setText(val)}
              style={{ flex: 1, border: 'none', background: 'transparent', boxShadow: 'none' }}
              options={users.map(u => ({
                value: u.displayname,
                label: u.displayname,
                key: u.uid,
              }))}
            />
            <Button 
              type="text"
              icon={<Send size={20} />} 
              onClick={handleSubmit}
              loading={submitting}
              disabled={!text.trim()}
              style={{ color: token.colorPrimary }}
            />
          </Flex>
        </Flex>
      </Flex>

      <List
        itemLayout="horizontal"
        dataSource={comments.filter(c => !c.parentid)}
        renderItem={(item) => (
          <List.Item style={{ padding: '16px 0', borderBlockEnd: `1px solid ${token.colorBorderSecondary}` }}>
            <List.Item.Meta
              avatar={<GithubCdnAvatar src={item.authorPhoto} size={36} onClick={() => navigate(`/profile/${item.authorid}`)} style={{ cursor: 'pointer' }} />}
              title={
                <Flex align="center" gap={12}>
                  <Text strong onClick={() => navigate(`/profile/${item.authorid}`)} style={{ cursor: 'pointer' }}>{item.authorName}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{relativeFromNow(item.createdat)}</Text>
                </Flex>
              }
              description={
                <Flex vertical>
                  <div style={{ margin: '4px 0 8px', lineHeight: 1.6, color: token.colorText }}>
                    <CommentText text={item.text} />
                  </div>
                  <Flex gap={12}>
                    <Button 
                      type="text" 
                      size="small" 
                      icon={<MessageSquare size={14} />} 
                      onClick={() => setReplyTo(item)}
                      style={{ color: token.colorTextSecondary, padding: 0, width: 'fit-content' }}
                    >
                      回复
                    </Button>
                    {(isAdmin || user?.id === item.authorid) && (
                      <Button 
                        type="text" 
                        size="small" 
                        danger
                        icon={<Trash2 size={14} />} 
                        onClick={() => handleDeleteComment(item.id)}
                        style={{ padding: 0, width: 'fit-content' }}
                      >
                        删除
                      </Button>
                    )}
                  </Flex>
                  
                  <div style={{ 
                    marginTop: 12, 
                    borderLeft: `2px solid ${token.colorBorderSecondary}`, 
                    paddingLeft: 16 
                  }}>
                    {comments.filter(c => c.parentid === item.id).map(reply => (
                      <Flex key={reply.id} gap={8} style={{ marginBottom: 12 }}>
                        <GithubCdnAvatar src={reply.authorPhoto} size={20} onClick={() => navigate(`/profile/${reply.authorid}`)} style={{ cursor: 'pointer' }} />
                        <Flex vertical style={{ flex: 1 }}>
                          <header style={{ fontSize: 13, marginBottom: 4 }}>
                            <Text strong style={{ marginRight: 8, cursor: 'pointer' }} onClick={() => navigate(`/profile/${reply.authorid}`)}>{reply.authorName}</Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>{relativeFromNow(reply.createdat)}</Text>
                          </header>
                          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                            <CommentText text={reply.text} />
                          </div>
                          <Flex gap={12}>
                            <Button 
                              type="text" 
                              size="small" 
                              icon={<MessageSquare size={12} />} 
                              onClick={() => setReplyTo(reply)}
                              style={{ width: 'fit-content', padding: 0 }}
                            >
                              回复
                            </Button>
                            {(isAdmin || user?.id === reply.authorid) && (
                              <Button 
                                type="text" 
                                size="small" 
                                danger
                                icon={<Trash2 size={12} />} 
                                onClick={() => handleDeleteComment(reply.id)}
                                style={{ padding: 0, width: 'fit-content' }}
                              >
                                删除
                              </Button>
                            )}
                          </Flex>
                        </Flex>
                      </Flex>
                    ))}
                  </div>
                </Flex>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
};

export default CommentSection;
