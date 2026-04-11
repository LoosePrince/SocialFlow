import React, { useState, useEffect, useCallback } from 'react';
import { Button, List, Space, Modal, App, Mentions, Flex, Typography, theme } from 'antd';
import { GithubCdnAvatar } from './GithubCdnAvatar';
import LikeList from './LikeList';
import { useNavigate } from 'react-router-dom';
import { Send, MessageSquare, MessageCircle, Trash2, Heart } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { getGithubUrl } from '../github';
import { toggleLike } from '../utils';
import CommentText from './CommentText';
import dayjs from 'dayjs';

const { Text } = Typography;

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
    const table = contentType === 'post' ? 'posts' : 'projects';
    const { data: row } = await supabase.from(table).select('likecount').eq('id', contentId).maybeSingle();
    if (row) setLikeCount(row.likecount ?? 0);
    if (user) {
      const { data: like } = await supabase
        .from('likes')
        .select('id')
        .eq('userid', user.id)
        .eq('contentid', contentId)
        .eq('contenttype', contentType)
        .maybeSingle();
      setLiked(!!like);
    } else {
      setLiked(false);
    }
  }, [contentId, contentType, user?.id]);

  useEffect(() => {
    fetchLikeMeta();
  }, [fetchLikeMeta]);

  useEffect(() => {
    const channel = supabase
      .channel(`comment-section-likes-${contentId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'likes', filter: `contentid=eq.${contentId}` },
        () => {
          fetchLikeMeta();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [contentId, fetchLikeMeta]);

  const handleLike = async () => {
    if (!user) {
      message.warning('请先登录后点赞');
      return;
    }
    try {
      await toggleLike(user.id, contentId, contentType);
      await fetchLikeMeta();
      setLikeListNonce((n) => n + 1);
    } catch {
      message.error('操作失败');
    }
  };

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        profiles:authorid (displayname, photourl)
      `)
      .eq('contentid', contentId)
      .eq('contenttype', contentType)
      .order('createdat', { ascending: false });

    if (!error && data) {
      setComments(data.map(c => ({
        ...c,
        authorName: c.profiles?.displayname,
        authorPhoto: c.profiles?.photourl ? (c.profiles.photourl.startsWith('http') ? c.profiles.photourl : getGithubUrl(c.profiles.photourl)) : ''
      })));
    }
  };

  useEffect(() => {
    fetchComments();
    const channel = supabase
      .channel(`comments-changes-${contentId}-${Date.now()}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'comments', 
        filter: `contentid=eq.${contentId}` 
      }, () => {
        fetchComments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contentId, contentType]);

  const handleSubmit = async () => {
    if (!user) {
      message.warning('请先登录后评论');
      return;
    }
    if (!text.trim()) return;

    setSubmitting(true);
    try {
      const mentionIds = users.filter(u => text.includes(`@${u.displayname}`)).map(u => u.uid);
      
      const { error } = await supabase.from('comments').insert([{
        contentid: contentId,
        contenttype: contentType,
        authorid: user.id,
        text: text.trim(),
        createdat: Date.now(),
        parentid: replyTo ? replyTo.id : null,
        replytoname: replyTo ? replyTo.authorName : null,
        mentionids: mentionIds,
      }]);

      if (error) throw error;

      // Update count
      try {
        const tableName = contentType === 'post' ? 'posts' : 'projects';
        const { error: rpcError } = await supabase.rpc('increment_comment_count', { 
          row_id: contentId, 
          table_name: tableName 
        });
        if (rpcError) throw rpcError;
      } catch (err) {
        // Fallback: Manual increment if RPC fails
        const table = contentType === 'post' ? 'posts' : 'projects';
        const { data } = await supabase.from(table).select('commentcount').eq('id', contentId).single();
        if (data) {
          await supabase.from(table).update({ 
            commentcount: (data.commentcount || 0) + 1 
          }).eq('id', contentId);
        }
      }

      setText('');
      setReplyTo(null);
      message.success('评论成功');
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
        const { error } = await supabase.from('comments').delete().eq('id', commentId);
        if (error) {
          message.error('删除失败');
        } else {
          message.success('评论已删除');
          // Manual decrement of the content's comment count
          try {
            const table = contentType === 'post' ? 'posts' : 'projects';
            const { data } = await supabase.from(table).select('commentcount').eq('id', contentId).single();
            if (data) {
              await supabase.from(table).update({ 
                commentcount: Math.max(0, (data.commentcount || 0) - 1) 
              }).eq('id', contentId);
            }
          } catch (e) {}
        }
      }
    });
  };

  return (
    <div style={{ background: token.colorBgContainer, borderRadius: token.borderRadiusLG, padding: 20 }}>
      {/* 点赞（动态 / 项目详情评论区上方） */}
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

      {/* Header */}
      <Flex align="center" gap={8} style={{ marginBottom: 20 }}>
        <MessageCircle size={18} />
        <Text strong style={{ fontSize: 16 }}>评论 · {comments.length}</Text>
      </Flex>

      {/* Input row */}
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
              <Text size="small">回复 <Text strong>@{replyTo.authorName}</Text></Text>
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
                  <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(item.createdat).fromNow()}</Text>
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
                  
                  {/* 子回复 */}
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
                            <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(reply.createdat).fromNow()}</Text>
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
