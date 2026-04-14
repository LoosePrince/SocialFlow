import React, { useState, useEffect, useRef } from 'react';
import { Typography, theme, Modal } from 'antd';
import { apiJson } from '../lib/api';
import { useI18n } from '../context/I18nContext';
import CommentText from './CommentText';

const { Text } = Typography;

interface CommentPreviewProps {
  contentId: string;
}

const CommentPreview: React.FC<CommentPreviewProps> = ({ contentId }) => {
  const [latestComment, setLatestComment] = useState<any>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const [openFull, setOpenFull] = useState(false);
  const { token } = theme.useToken();
  const { t } = useI18n();
  const textWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const data = await apiJson<{
          profiles?: { displayname?: string };
          text?: string;
        } | null>(`/api/comments/latest?contentId=${encodeURIComponent(contentId)}`);
        setLatestComment(data);
      } catch {
        setLatestComment(null);
      }
    };

    void fetchLatest();
  }, [contentId]);

  useEffect(() => {
    const el = textWrapRef.current;
    if (!el || !latestComment?.text) {
      setIsOverflow(false);
      return;
    }

    const measure = () => {
      setIsOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    measure();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [latestComment?.text]);

  if (!latestComment) return null;

  return (
    <>
      <div
        role={isOverflow ? 'button' : undefined}
        tabIndex={isOverflow ? 0 : undefined}
        onClick={() => {
          if (isOverflow) {
            setOpenFull(true);
          }
        }}
        onKeyDown={(e) => {
          if (!isOverflow) {
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpenFull(true);
          }
        }}
        style={{ 
          background: token.colorFillAlter, 
          padding: '6px 12px', 
          borderRadius: '8px',
          marginTop: '8px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          maxWidth: '100%',
          transition: 'all 0.2s',
          cursor: isOverflow ? 'pointer' : 'default',
        }}
      >
        <Text strong style={{ fontSize: '13px', color: token.colorText, whiteSpace: 'nowrap' }}>
          {latestComment.profiles?.displayname}
        </Text>
        <div
          ref={textWrapRef}
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
          <CommentText text={latestComment.text ?? ''} singleLine />
        </div>
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
            {latestComment.profiles?.displayname}
          </Text>
          <CommentText text={latestComment.text ?? ''} />
        </div>
      </Modal>
    </>
  );
};

export default CommentPreview;
