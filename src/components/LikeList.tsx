import React, { useState, useEffect } from 'react';
import { Avatar, Tooltip, Flex, Typography, theme } from 'antd';
import { GithubCdnAvatar } from './GithubCdnAvatar';
import { getGithubUrl } from '../github';
import { apiJson } from '../lib/api';
import { subscribeAppEvents } from '../lib/appSse';

const { Text } = Typography;

interface LikeListProps {
  contentId: string;
  contentType?: 'post' | 'project';
  alwaysShow?: boolean;
  refreshNonce?: number;
}

const LikeList: React.FC<LikeListProps> = ({ contentId, contentType, alwaysShow, refreshNonce = 0 }) => {
  const [likes, setLikes] = useState<any[]>([]);
  const { token } = theme.useToken();

  useEffect(() => {
    const fetchLikes = async () => {
      const q =
        contentType === 'post' || contentType === 'project'
          ? `?contentId=${encodeURIComponent(contentId)}&contentType=${encodeURIComponent(contentType)}`
          : `?contentId=${encodeURIComponent(contentId)}`;
      try {
        const data = await apiJson<
          Array<{
            id: string;
            profiles?: { displayname?: string; photourl?: string };
          }>
        >(`/api/likes${q}`);
        setLikes(
          data.map((l) => ({
            ...l,
            userName: l.profiles?.displayname,
            userPhoto: l.profiles?.photourl ? getGithubUrl(l.profiles.photourl) : '',
          }))
        );
      } catch {
        setLikes([]);
      }
    };

    void fetchLikes();

    const unsub = subscribeAppEvents((data) => {
      if (data.table === 'likes') {
        void fetchLikes();
      }
    });
    return () => unsub();
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
