import React, { useState, useEffect } from 'react';
import { Typography, theme, Modal } from 'antd';
import { apiJson } from '../lib/api';
import { useI18n } from '../context/I18nContext';
import CommentText from './CommentText';

const { Text } = Typography;

interface CommentPreviewProps {
  contentId: string;
  contentType?: 'post' | 'project';
}

const CommentPreview: React.FC<CommentPreviewProps> = ({ contentId, contentType = 'post' }) => {
  const [comments, setComments] = useState<Array<{ profiles?: { displayname?: string }; text?: string }>>([]);
  const [selectedComment, setSelectedComment] = useState<{ profiles?: { displayname?: string }; text?: string } | null>(null);
  const [openFull, setOpenFull] = useState(false);
  const { token } = theme.useToken();
  const { t } = useI18n();

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const data = await apiJson<Array<{ profiles?: { displayname?: string }; text?: string }>>(
          `/api/comments?contentId=${encodeURIComponent(contentId)}&contentType=${encodeURIComponent(contentType)}`
        );
        setComments(Array.isArray(data) ? data.slice(0, 5) : []);
      } catch {
        setComments([]);
      }
    };

    void fetchComments();
  }, [contentId, contentType]);

  if (comments.length === 0) return null;

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 8,
          marginTop: 8,
        }}
      >
        {comments.map((comment, index) => (
          <div
            key={`${comment.profiles?.displayname ?? 'u'}-${index}-${comment.text ?? ''}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              setSelectedComment(comment);
              setOpenFull(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedComment(comment);
                setOpenFull(true);
              }
            }}
            style={{
              background: token.colorFillAlter,
              padding: '6px 12px',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              width: 'fit-content',
              maxWidth: '100%',
              transition: 'all 0.2s',
              cursor: 'pointer',
            }}
          >
            <Text strong style={{ fontSize: '13px', color: token.colorText, whiteSpace: 'nowrap' }}>
              {comment.profiles?.displayname}
            </Text>
            <div
              style={{
                fontSize: '13px',
                color: token.colorTextDescription,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
            >
              <CommentText text={comment.text ?? ''} singleLine />
            </div>
          </div>
        ))}
      </div>

      <Modal
        title={t('comment.full')}
        open={openFull}
        onCancel={() => setOpenFull(false)}
        footer={null}
        destroyOnHidden
      >
        <div style={{ lineHeight: 1.6, color: token.colorText }}>
          <Text strong style={{ marginRight: 8 }}>
            {selectedComment?.profiles?.displayname}
          </Text>
          <CommentText text={selectedComment?.text ?? ''} />
        </div>
      </Modal>
    </>
  );
};

export default CommentPreview;
