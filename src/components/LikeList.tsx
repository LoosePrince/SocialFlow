import React, { useState, useEffect } from 'react';
import { Avatar, Tooltip, Flex, Typography, theme } from 'antd';
import { GithubCdnAvatar } from './GithubCdnAvatar';
import { supabase } from '../supabase';
import { getGithubUrl } from '../github';

const { Text } = Typography;

interface LikeListProps {
  contentId: string;
  /** 与点赞记录一致，避免 id 碰撞时混查 */
  contentType?: 'post' | 'project';
  /** 详情评论区等：无赞也保留一行展示「0 人觉得很赞」 */
  alwaysShow?: boolean;
  /** 变化时重新拉取列表（不依赖 Realtime；点赞成功后由父组件递增） */
  refreshNonce?: number;
}

const LikeList: React.FC<LikeListProps> = ({ contentId, contentType, alwaysShow, refreshNonce = 0 }) => {
  const [likes, setLikes] = useState<any[]>([]);
  const { token } = theme.useToken();

  useEffect(() => {
    const fetchLikes = async () => {
      let q = supabase
        .from('likes')
        .select('*, profiles:userid (displayname, photourl)')
        .eq('contentid', contentId);
      if (contentType) {
        q = q.eq('contenttype', contentType);
      }
      const { data, error } = await q;

      if (!error && data) {
        setLikes(data.map(l => ({
          ...l,
          userName: l.profiles?.displayname,
          userPhoto: l.profiles?.photourl ? (l.profiles.photourl.startsWith('http') ? l.profiles.photourl : getGithubUrl(l.profiles.photourl)) : ''
        })));
      }
    };

    fetchLikes();

    // Real-time subscription for likes
    const channel = supabase
      .channel(`likes-realtime-${contentId}-${Date.now()}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'likes', 
        filter: `contentid=eq.${contentId}` 
      }, () => {
        fetchLikes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contentId, contentType, refreshNonce]);

  if (likes.length === 0 && !alwaysShow) return null;

  return (
    <Flex
      align="center"
      gap={8}
      wrap="wrap"
      style={{
        marginTop: alwaysShow ? 0 : 12,
        padding: '6px 12px',
        background: token.colorFillAlter,
        borderRadius: token.borderRadius,
        width: alwaysShow ? '100%' : 'fit-content',
      }}
    >
      {likes.length > 0 && (
        <Avatar.Group max={{ count: 8 }} size="small">
          {likes.map((like, index) => (
            <Tooltip title={like.userName} key={like.id ?? index}>
              <GithubCdnAvatar src={like.userPhoto} />
            </Tooltip>
          ))}
        </Avatar.Group>
      )}
      <Text type="secondary" style={{ fontSize: 12 }}>
        {likes.length} 人觉得很赞
      </Text>
    </Flex>
  );
};

export default LikeList;
