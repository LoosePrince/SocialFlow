import React from 'react';
import { Link } from 'react-router-dom';
import { useUsers } from '../hooks/useUsers';
import { theme } from 'antd';

interface CommentTextProps {
  text: string;
}

const CommentText: React.FC<CommentTextProps> = ({ text }) => {
  const { users } = useUsers();
  const { token } = theme.useToken();
  
  const tokens = text.split(/(@\S+)/);

  return (
    <span className="comment-text-content">
      {tokens.map((token, index) => {
        if (token.startsWith('@')) {
          const name = token.substring(1);
          // Fixed property name to displayname to match hook return
          const mentionedUser = users.find(u => u.displayname === name);
          if (mentionedUser) {
            return (
              <Link 
                key={index} 
                to={`/profile/${mentionedUser.uid}`}
                style={{ 
                  color: token.colorPrimary, 
                  fontWeight: 500,
                  textDecoration: 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                {token}
              </Link>
            );
          }
        }
        return <span key={index}>{token}</span>;
      })}
    </span>
  );
};

export default CommentText;
