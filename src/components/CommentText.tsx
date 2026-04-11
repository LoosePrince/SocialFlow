import React from 'react';
import { Link } from 'react-router-dom';
import { useUsers } from '../hooks/useUsers';
import { theme } from 'antd';

interface CommentTextProps {
  text: string;
}

const CommentText: React.FC<CommentTextProps> = ({ text }) => {
  const { users } = useUsers();
  const { token: themeToken } = theme.useToken();

  const tokens = text.split(/(@\S+)/);

  return (
    <span className="comment-text-content">
      {tokens.map((part, index) => {
        if (part.startsWith('@')) {
          const name = part.substring(1);
          const mentionedUser = users.find(u => u.displayname === name);
          if (mentionedUser) {
            return (
              <Link 
                key={index} 
                to={`/profile/${mentionedUser.uid}`}
                style={{ 
                  color: themeToken.colorPrimary, 
                  fontWeight: 500,
                  textDecoration: 'none'
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.textDecoration = 'underline'; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.textDecoration = 'none'; }}
              >
                {part}
              </Link>
            );
          }
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};

export default CommentText;
