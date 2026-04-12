import { Grid, theme } from 'antd';
import { motion } from 'framer-motion';
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CreatePanel from '../components/CreatePanel';

const { useBreakpoint } = Grid;

const Create: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const editTarget = useMemo(() => {
    const id = searchParams.get('edit');
    const type = searchParams.get('type');
    if (id && (type === 'post' || type === 'project')) {
      return { kind: type, id } as const;
    }
    return undefined;
  }, [searchParams]);

  const onSuccess = () => {
    if (editTarget) {
      navigate(editTarget.kind === 'post' ? `/post/${editTarget.id}` : `/project/${editTarget.id}`);
    } else {
      navigate('/');
    }
  };

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
      <CreatePanel variant="page" editTarget={editTarget} onSuccess={onSuccess} />
    </motion.div>
  );
};

export default Create;
