import React from 'react';
import { Result, Spin } from 'antd';
import { useAuth } from '../context/AuthContext';
import RequireAuth from './RequireAuth';

type Props = { children: React.ReactNode };

const RequireAdmin: React.FC<Props> = ({ children }) => {
  const { loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Result status="403" title="403" subTitle="你没有权限访问后台管理。" />;
  }

  return <>{children}</>;
};

const RequireAdminRoute: React.FC<Props> = ({ children }) => (
  <RequireAuth>
    <RequireAdmin>{children}</RequireAdmin>
  </RequireAuth>
);

export default RequireAdminRoute;
