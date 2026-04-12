import React from 'react';
import { Link } from 'react-router-dom';
import { useUsers } from '../hooks/useUsers';
import { theme } from 'antd';
import { useTwikooOwo } from '../hooks/useTwikooOwo';
import { parseCommentSegments, type CommentSegment } from '../lib/commentSegments';

interface CommentTextProps {
  text: string;
}

const CommentText: React.FC<CommentTextProps> = ({ text }) => {
  const { users } = useUsers();
  const { token: themeToken } = theme.useToken();
  const { getIcon } = useTwikooOwo();

  const segments = parseCommentSegments(text);

  const renderSegment = (seg: CommentSegment, index: number) => {
    switch (seg.kind) {
      case 'text':
        return <span key={index}>{seg.value}</span>;
      case 'mention': {
        const mentionedUser = users.find((u) => u.displayname === seg.handle);
        if (mentionedUser) {
          return (
            <Link
              key={index}
              to={`/profile/${mentionedUser.uid}`}
              style={{
                color: themeToken.colorPrimary,
                fontWeight: 500,
                textDecoration: 'none',
              }}
              onMouseEnter={(ev) => {
                ev.currentTarget.style.textDecoration = 'underline';
              }}
              onMouseLeave={(ev) => {
                ev.currentTarget.style.textDecoration = 'none';
              }}
            >
              {seg.raw}
            </Link>
          );
        }
        return <span key={index}>{seg.raw}</span>;
      }
      case 'owo': {
        const url = getIcon(seg.id);
        if (url) {
          return (
            <img
              key={index}
              src={url}
              alt=""
              loading="lazy"
              style={{
                height: '1.25em',
                width: 'auto',
                maxWidth: '6em',
                verticalAlign: 'text-bottom',
                display: 'inline-block',
                margin: '0 1px',
              }}
            />
          );
        }
        return <span key={index}>{seg.raw}</span>;
      }
      default: {
        const _exhaustive: never = seg;
        return _exhaustive;
      }
    }
  };

  return (
    <span className="comment-text-content">
      {segments.map((seg, index) => renderSegment(seg, index))}
    </span>
  );
};

export default CommentText;
