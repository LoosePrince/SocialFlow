import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Typography, theme, Grid } from 'antd';
import { motion } from 'framer-motion';
import CreatePanel from '../components/CreatePanel';

const { useBreakpoint } = Grid;

const Create: React.FC = () => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  return (
    <motion.div
      className="create-page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        maxWidth: 680,
        margin: '0 auto',
        paddingBottom: isMobile
          ? 'max(32px, calc(env(safe-area-inset-bottom, 0px) + 8px))'
          : 48,
      }}
    >
      <CreatePanel variant="page" onSuccess={() => navigate('/')} />

      {!isMobile && (
        <Typography.Paragraph style={{ textAlign: 'center', marginTop: 24, marginBottom: 0 }}>
          <Link to="/" style={{ color: token.colorTextSecondary }}>
            返回首页
          </Link>
        </Typography.Paragraph>
      )}
    </motion.div>
  );
};

export default Create;
