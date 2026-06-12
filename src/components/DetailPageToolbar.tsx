import { Button, Flex, Grid, theme } from 'antd';
import { ArrowLeft } from 'lucide-react';
import React from 'react';
import { useScrollRevealBar } from '../hooks/useScrollRevealBar';

const { useBreakpoint } = Grid;

const NAVBAR_HEIGHT = 64;
const TOOLBAR_HEIGHT = 48;

type DetailPageToolbarProps = {
  backLabel: string;
  onBack: () => void;
  editAction?: React.ReactNode;
};

const DetailPageToolbar: React.FC<DetailPageToolbarProps> = ({ backLabel, onBack, editAction }) => {
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const visible = useScrollRevealBar(isMobile);

  const backButton = (
    <Button
      type="text"
      icon={<ArrowLeft size={16} />}
      onClick={onBack}
      style={{ color: token.colorTextSecondary }}
    >
      {backLabel}
    </Button>
  );

  if (!isMobile) {
    return (
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }} wrap="wrap" gap={8}>
        {backButton}
        {editAction}
      </Flex>
    );
  }

  return (
    <>
      <div aria-hidden style={{ height: TOOLBAR_HEIGHT, marginBottom: 16 }} />
      <Flex
        justify="space-between"
        align="center"
        wrap="nowrap"
        gap={8}
        style={{
          position: 'fixed',
          top: NAVBAR_HEIGHT,
          left: 0,
          right: 0,
          zIndex: 6,
          height: TOOLBAR_HEIGHT,
          padding: '8px 16px',
          background: token.colorBgContainer,
          transform: visible ? 'translateY(0)' : `translateY(-${TOOLBAR_HEIGHT}px)`,
          transition: 'transform 0.25s ease',
          borderBottom: visible ? `1px solid ${token.colorBorderSecondary}` : 'none',
          boxSizing: 'border-box',
        }}
      >
        {backButton}
        {editAction}
      </Flex>
    </>
  );
};

export default DetailPageToolbar;
