import { Button, Empty } from 'antd';
import type { ButtonProps } from 'antd';
import React from 'react';

type ActionEmptyProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actionText?: React.ReactNode;
  onAction?: ButtonProps['onClick'];
  image?: React.ReactNode;
};

const ActionEmpty: React.FC<ActionEmptyProps> = ({
  title,
  description,
  actionText,
  onAction,
  image = Empty.PRESENTED_IMAGE_SIMPLE,
}) => {
  return (
    <Empty
      className="sf-empty"
      image={image}
      description={
        <div>
          {title && <div className="sf-empty-title">{title}</div>}
          {description && <div className="sf-empty-desc">{description}</div>}
        </div>
      }
    >
      {actionText && (
        <Button type="primary" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </Empty>
  );
};

export default ActionEmpty;
