import React from 'react';
import { Link } from 'react-router-dom';
import { useUsers } from '../hooks/useUsers';
import { theme, Tooltip } from 'antd';
import { useTwikooOwo } from '../hooks/useTwikooOwo';
import { parseCommentSegments, type CommentSegment } from '../lib/commentSegments';

interface CommentTextProps {
  text: string;
  singleLine?: boolean;
  preventOuterClick?: boolean;
}

/** 悬停预览：单边介于 50px～150px，不足则放大、过大则缩小 */
const OWO_PREVIEW_IMG: React.CSSProperties = {
  display: 'block',
  maxWidth: 150,
  maxHeight: 150,
  minWidth: 50,
  minHeight: 50,
  width: 'auto',
  height: 'auto',
  objectFit: 'contain',
};

const CommentText: React.FC<CommentTextProps> = ({
  text,
  singleLine = false,
  preventOuterClick = false,
}) => {
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
              onClick={(ev) => {
                if (preventOuterClick) ev.stopPropagation();
              }}
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
      case 'link':
        return (
          <a
            key={index}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => {
              if (preventOuterClick) ev.stopPropagation();
            }}
            style={{
              color: themeToken.colorLink,
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
          </a>
        );
      case 'owo': {
        const url = getIcon(seg.id);
        if (url) {
          const inline = (
            <img
              src={url}
              alt=""
              loading="lazy"
              draggable={false}
              style={{
                height: '1.25em',
                width: 'auto',
                maxWidth: '6em',
                verticalAlign: 'middle',
                display: 'inline-block',
                margin: '0 1px',
              }}
            />
          );
          return (
            <Tooltip
              key={index}
              placement="top"
              mouseEnterDelay={0.12}
              styles={{
                body: {
                  padding: 8,
                },
              }}
              title={
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    maxWidth: 150,
                    maxHeight: 150,
                    minWidth: 50,
                    minHeight: 50,
                  }}
                >
                  <img src={url} alt="" style={OWO_PREVIEW_IMG} />
                </div>
              }
            >
              <span
                style={{
                  display: 'inline-block',
                  lineHeight: 1,
                  verticalAlign: 'middle',
                }}
              >
                {inline}
              </span>
            </Tooltip>
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
    <span
      className="comment-text-content"
      style={{
        whiteSpace: singleLine ? 'nowrap' : 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {segments.map((seg, index) => renderSegment(seg, index))}
    </span>
  );
};

export default CommentText;
