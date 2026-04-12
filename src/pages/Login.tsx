import { Spin, theme } from 'antd';
import { motion } from 'framer-motion';
import React, { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoginPanel from '../components/LoginPanel';
import { useAuth } from '../context/AuthContext';
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
    </motion.div>
  );
};

export default Login;
