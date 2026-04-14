import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Result } from 'antd';
import { motion } from 'framer-motion';
import { useI18n } from '../context/I18nContext';

const NotFound: React.FC = () => {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: '48px 0', textAlign: 'center' }}
    >
      <Result
        status="404"
        title={t('notFound.title')}
        subTitle={t('notFound.subtitle')}
        extra={
          <Link to="/">
            <Button type="primary">{t('notFound.backHome')}</Button>
          </Link>
        }
      />
    </motion.div>
  );
};

export default NotFound;
