import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '../context/AuthContext';
import { sanitizeReturnPath } from '../lib/navigation';

type Props = { children: React.ReactNode };

const RequireAuth: React.FC<Props> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    const from = sanitizeReturnPath(location.pathname + location.search);
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
