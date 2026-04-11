import React, { useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Typography, theme, Spin } from 'antd';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import LoginPanel from '../components/LoginPanel';
import { sanitizeReturnPath } from '../lib/navigation';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const { token } = theme.useToken();

  const returnTo = useMemo(
    () => sanitizeReturnPath(searchParams.get('from') || '/'),
    [searchParams]
  );

  useEffect(() => {
    if (!loading && user) {
      navigate(returnTo, { replace: true });
    }
  }, [user, loading, navigate, returnTo]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 420, margin: '0 auto', paddingBottom: 48 }}
    >
      <LoginPanel variant="page" returnTo={returnTo} />

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <Link to="/" style={{ color: token.colorTextSecondary }}>
          返回首页
        </Link>
      </div>
    </motion.div>
  );
};

export default Login;
