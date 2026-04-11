import React, { useState, useEffect } from 'react';
import { Typography, Space, theme } from 'antd';
import { supabase } from '../supabase';

const { Text } = Typography;

interface CommentPreviewProps {
  contentId: string;
}

const CommentPreview: React.FC<CommentPreviewProps> = ({ contentId }) => {
  const [latestComment, setLatestComment] = useState<any>(null);
  const { token } = theme.useToken();

  useEffect(() => {
    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*, profiles:authorid (displayname)')
        .eq('contentid', contentId)
        .order('createdat', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setLatestComment(data);
      }
    };

    fetchLatest();
  }, [contentId]);

  if (!latestComment) return null;

  return (
    <div style={{ 
      background: token.colorFillAlter, 
      padding: '6px 12px', 
      borderRadius: '8px',
      marginTop: '8px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      maxWidth: '100%',
      transition: 'all 0.2s'
    }}>
      <Text strong style={{ fontSize: '13px', color: token.colorText, whiteSpace: 'nowrap' }}>
        {latestComment.profiles?.displayname}
      </Text>
      <Text style={{ fontSize: '13px', color: token.colorTextDescription }} ellipsis>
        {latestComment.text}
      </Text>
    </div>
  );
};

export default CommentPreview;
