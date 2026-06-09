import React, { useState, useEffect, useCallback } from 'react';
import { Button, List, Space, Modal, App, Mentions, Flex, Typography, theme, Avatar, Input, Segmented, Grid } from 'antd';
import { GithubCdnAvatar } from './GithubCdnAvatar';
import LikeList from './LikeList';
import { useNavigate } from 'react-router-dom';
import { Send, MessageSquare, MessageCircle, Trash2, Heart, User, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { getGithubUrl } from '../github';
import { toggleLike } from '../utils';
import CommentText from './CommentText';
import OwoEmojiPicker from './OwoEmojiPicker';
import dayjs from 'dayjs';
import { apiJson, onApiCacheUpdate } from '../lib/api';
import { subscribeAppEvents } from '../lib/appSse';
import { toMillis } from '../lib/time';
import { useLoginModal } from '../context/LoginModalContext';
import { useI18n } from '../context/I18nContext';

const { Text } = Typography;
const { useBreakpoint } = Grid;

function relativeFromNow(v: unknown) {
  const ms = toMillis(v);
  return ms != null ? dayjs(ms).fromNow() : '—';
}

interface CommentSectionProps {
  contentId: string;
  contentType: 'post' | 'project';
}

type CommentApiItem = {
  id: string;
  authorid: string;
  text: string;
  createdat: number;
  parentid?: string | null;
  profiles?: { displayname?: string; photourl?: string };
};

function normalizeComments(data: CommentApiItem[]) {
  return data.map((c) => ({
    ...c,
    authorName: c.profiles?.displayname,
    authorPhoto: c.profiles?.photourl ? getGithubUrl(c.profiles.photourl) : '',
  }));
}

const CommentSection: React.FC<CommentSectionProps> = ({ contentId, contentType }) => {
  const { user, profile, isAdmin } = useAuth();
  const { openLoginModal } = useLoginModal();
  const { token } = theme.useToken();
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeListNonce, setLikeListNonce] = useState(0);
  const [editCommentId, setEditCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);
  const [composeMode, setComposeMode] = useState<'edit' | 'preview'>('edit');
  const [editCommentViewMode, setEditCommentViewMode] = useState<'edit' | 'preview'>('edit');
  const { users } = useUsers();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const screens = useBreakpoint();

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
    const path =
      contentType === 'post' ? `/api/posts/${contentId}` : `/api/projects/${contentId}`;
    const unsubContent = onApiCacheUpdate<{ likecount?: number }>(path, (row) => {
      setLikeCount(row.likecount ?? 0);
    });
    const statusPath = `/api/likes/status?contentId=${encodeURIComponent(contentId)}`;
    const unsubStatus = onApiCacheUpdate<{ liked: boolean }>(statusPath, (status) => {
      setLiked(!!status.liked);
    });
    return () => {
      unsubContent();
      unsubStatus();
    };
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
      openLoginModal();
      return;
    }
    try {
      await toggleLike(contentId, contentType);
      await fetchLikeMeta();
      setLikeListNonce((n) => n + 1);
    } catch {
      message.error(t('common.actionFailed'));
    }
  };

  const fetchComments = async () => {
    const path = `/api/comments?contentId=${encodeURIComponent(contentId)}&contentType=${encodeURIComponent(contentType)}`;
    try {
      const data = await apiJson<CommentApiItem[]>(path);
      setComments(normalizeComments(data));
    } catch {
      if (comments.length === 0) setComments([]);
    }
  };

  useEffect(() => {
    const path = `/api/comments?contentId=${encodeURIComponent(contentId)}&contentType=${encodeURIComponent(contentType)}`;
    void fetchComments();
    const unsubCache = onApiCacheUpdate<CommentApiItem[]>(path, (data) => {
      setComments(normalizeComments(data));
    });
    const unsub = subscribeAppEvents((data) => {
      if (data.table === 'comments') {
        void fetchComments();
      }
    });
    return () => {
      unsubCache();
      unsub();
    };
  }, [contentId, contentType]);

  useEffect(() => {
    if (!user) {
      setReplyTo(null);
      setText('');
    }
  }, [user]);

  const handleSubmit = async () => {
    if (!user) {
      openLoginModal();
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
      message.success(t('comment.submitSuccess'));
      await fetchComments();
    } catch (err: any) {
      message.error(`${t('comment.submitFailed')} ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditComment = (c: { id: string; text: string }) => {
    setEditCommentId(c.id);
    setEditCommentText(c.text);
    setEditCommentViewMode('edit');
  };

  useEffect(() => {
    if (editCommentId === null) setEditCommentViewMode('edit');
  }, [editCommentId]);

  const handleSaveCommentEdit = async () => {
    if (!editCommentId || !editCommentText.trim()) return;
    setSavingCommentEdit(true);
    try {
      await apiJson(`/api/comments/${editCommentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: editCommentText.trim() }),
      });
      message.success(t('comment.updated'));
      setEditCommentId(null);
      await fetchComments();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : t('common.saveFailed'));
    } finally {
      setSavingCommentEdit(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    modal.confirm({
      title: t('comment.deleteConfirmTitle'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await apiJson(`/api/comments/${commentId}`, { method: 'DELETE' });
          message.success(t('comment.deleted'));
          await fetchComments();
        } catch {
          message.error(t('common.deleteFailed'));
        }
      },
    });
  };

  return (
    <div style={{ background: token.colorBgContainer, borderRadius: token.borderRadiusLG, padding: 20 }}>
      <Modal
        title={t('comment.editTitle')}
        open={editCommentId !== null}
        onOk={() => void handleSaveCommentEdit()}
        onCancel={() => setEditCommentId(null)}
        confirmLoading={savingCommentEdit}
        okText={t('common.save')}
        destroyOnClose
      >
        <Flex vertical gap={10}>
          <Segmented
            size="middle"
            value={editCommentViewMode}
            onChange={(v) => setEditCommentViewMode(v as 'edit' | 'preview')}
            block
            options={[
              { label: t('common.edit'), value: 'edit' },
              { label: t('common.preview'), value: 'preview' },
            ]}
          />
          {editCommentViewMode === 'edit' ? (
            <Flex align="start" gap={8}>
              <Input.TextArea
                rows={5}
                value={editCommentText}
                onChange={(e) => setEditCommentText(e.target.value)}
                placeholder={t('comment.editPlaceholder')}
                style={{ flex: 1 }}
              />
              <OwoEmojiPicker
                buttonSize="middle"
                onInsert={(ph) => setEditCommentText((t) => t + ph)}
              />
            </Flex>
          ) : (
            <div
              style={{
                minHeight: 120,
                padding: '10px 12px',
                borderRadius: token.borderRadius,
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
                lineHeight: 1.6,
                color: token.colorText,
              }}
            >
              {editCommentText.trim() ? (
                <CommentText text={editCommentText} />
              ) : (
                <Text type="secondary">{t('common.emptyContent')}</Text>
              )}
            </div>
          )}
        </Flex>
      </Modal>
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
        <Text strong style={{ fontSize: 16 }}>{t('comment.title')} · {comments.length}</Text>
      </Flex>

      <Flex gap={12} style={{ marginBottom: 24 }}>
        {screens.md && (
          user ? (
            <GithubCdnAvatar src={profile?.photourl} size={40} style={{ flexShrink: 0 }} />
          ) : (
            <Avatar
              size={40}
              style={{
                flexShrink: 0,
                background: token.colorFillSecondary,
                color: token.colorTextDescription,
              }}
              icon={<User size={20} />}
            />
          )
        )}
        <Flex vertical style={{ flex: 1 }}>
          {user && replyTo && (
            <Flex justify="space-between" align="center" style={{ 
              background: token.colorBgLayout, 
              padding: '4px 12px', 
              borderRadius: 8, 
              marginBottom: 8 
            }}>
              <Text style={{ fontSize: 12 }}>{t('comment.replyTo')} <Text strong>@{replyTo.authorName}</Text></Text>
              <Button type="link" size="small" onClick={() => setReplyTo(null)}>{t('common.cancel')}</Button>
            </Flex>
          )}
          {user ? (
            <Flex vertical gap={8} style={{ flex: 1 }}>
              <Segmented
                size="small"
                value={composeMode}
                onChange={(v) => setComposeMode(v as 'edit' | 'preview')}
                options={[
                  { label: t('common.edit'), value: 'edit' },
                  { label: t('common.preview'), value: 'preview' },
                ]}
                style={{ alignSelf: 'flex-start' }}
              />
              <Flex
                align="end"
                gap={8}
                style={{
                  background: token.colorBgLayout,
                  borderRadius: 12,
                  padding: 8,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                {composeMode === 'edit' ? (
                  <>
                    <Mentions
                      placeholder={t('comment.placeholder')}
                      autoSize={{ minRows: 1, maxRows: 6 }}
                      value={text}
                      onChange={(val) => setText(val)}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        boxShadow: 'none',
                      }}
                      options={users.map((u) => ({
                        value: u.displayname,
                        label: u.displayname,
                        key: u.uid,
                      }))}
                    />
                    <OwoEmojiPicker onInsert={(ph) => setText((t) => t + ph)} />
                  </>
                ) : (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 40,
                      padding: '4px 0',
                      lineHeight: 1.6,
                      color: token.colorText,
                    }}
                  >
                    {text.trim() ? (
                      <CommentText text={text} />
                    ) : (
                      <Text type="secondary">{t('common.emptyContent')}</Text>
                    )}
                  </div>
                )}
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
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => openLoginModal()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openLoginModal();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                minHeight: 44,
                padding: '8px 12px',
                background: token.colorBgLayout,
                borderRadius: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
                cursor: 'pointer',
                transition: 'border-color 0.2s, background 0.2s',
              }}
            >
              <Text type="secondary" style={{ flex: 1, userSelect: 'none' }}>
                {t('comment.loginToJoin')}
              </Text>
              <Text type="secondary" style={{ fontSize: 12, userSelect: 'none' }}>
                {t('nav.login')}
              </Text>
            </div>
          )}
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
                      onClick={() => {
                        if (!user) {
                          openLoginModal();
                          return;
                        }
                        setReplyTo(item);
                      }}
                      style={{ color: token.colorTextSecondary, padding: 0, width: 'fit-content' }}
                    >
                      {t('comment.reply')}
                    </Button>
                    {isAdmin && (
                      <Button
                        type="text"
                        size="small"
                        icon={<Pencil size={14} />}
                        onClick={() => openEditComment(item)}
                        style={{ padding: 0, width: 'fit-content' }}
                      >
                        {t('common.edit')}
                      </Button>
                    )}
                    {(isAdmin || user?.id === item.authorid) && (
                      <Button 
                        type="text" 
                        size="small" 
                        danger
                        icon={<Trash2 size={14} />} 
                        onClick={() => handleDeleteComment(item.id)}
                        style={{ padding: 0, width: 'fit-content' }}
                      >
                        {t('common.delete')}
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
                              onClick={() => {
                                if (!user) {
                                  openLoginModal();
                                  return;
                                }
                                setReplyTo(reply);
                              }}
                              style={{ width: 'fit-content', padding: 0 }}
                            >
                              {t('comment.reply')}
                            </Button>
                            {isAdmin && (
                              <Button
                                type="text"
                                size="small"
                                icon={<Pencil size={12} />}
                                onClick={() => openEditComment(reply)}
                                style={{ padding: 0, width: 'fit-content' }}
                              >
                                {t('common.edit')}
                              </Button>
                            )}
                            {(isAdmin || user?.id === reply.authorid) && (
                              <Button 
                                type="text" 
                                size="small" 
                                danger
                                icon={<Trash2 size={12} />} 
                                onClick={() => handleDeleteComment(reply.id)}
                                style={{ padding: 0, width: 'fit-content' }}
                              >
                                {t('common.delete')}
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
