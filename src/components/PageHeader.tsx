import { Flex, Typography } from 'antd';
import React from 'react';

const { Title, Text } = Typography;

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  level?: 1 | 2 | 3 | 4 | 5;
  compact?: boolean;
};

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  level = 2,
  compact = false,
}) => {
  return (
    <Flex
      className={`sf-page-header${compact ? ' sf-page-header-compact' : ''}`}
      justify="space-between"
      align="center"
      gap={12}
      wrap="wrap"
    >
      <div style={{ minWidth: 0 }}>
        <Title level={level} className="sf-page-title">
          {title}
        </Title>
        {description && (
          <Text type="secondary" className="sf-page-desc">
            {description}
          </Text>
        )}
      </div>
      {actions && <div className="sf-page-actions">{actions}</div>}
    </Flex>
  );
};

export default PageHeader;
