import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Result } from 'antd';
import { motion } from 'framer-motion';

const NotFound: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: '48px 0', textAlign: 'center' }}
    >
      <Result
        status="404"
        title="页面不存在"
        subTitle="链接可能已失效，或地址输入有误。"
        extra={
          <Link to="/">
            <Button type="primary">返回首页</Button>
          </Link>
        }
      />
    </motion.div>
  );
};

export default NotFound;
