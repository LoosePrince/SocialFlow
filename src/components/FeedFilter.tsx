import React from 'react';
import { Flex, Grid, Segmented, Typography, theme } from 'antd';
import { FolderKanban, List, ListFilter, Newspaper } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

export type FeedFilterValue = 'all' | 'post' | 'project';

interface FeedFilterProps {
  value: FeedFilterValue;
  onChange: (value: FeedFilterValue) => void;
  style?: React.CSSProperties;
}

const { Text } = Typography;
const { useBreakpoint } = Grid;

const FeedFilter: React.FC<FeedFilterProps> = ({ value, onChange, style }) => {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const screens = useBreakpoint();

  const label = (Icon: typeof List, text: string) => (
    <Flex align="center" justify="center" gap={6} style={{ minWidth: screens.md ? 72 : undefined }}>
      <Icon size={15} strokeWidth={2} />
      <span>{text}</span>
    </Flex>
  );

  return (
    <Flex
      align={screens.md ? 'center' : 'stretch'}
      justify="space-between"
      vertical={!screens.md}
      gap={8}
      style={{
        marginBottom: screens.md ? 16 : 0,
        padding: screens.md ? 0 : '12px 16px',
        borderBottom: screens.md ? undefined : `1px solid ${token.colorBorderSecondary}`,
        background: screens.md ? 'transparent' : token.colorBgContainer,
        ...style,
      }}
    >
      <Flex align="center" gap={6}>
        <ListFilter size={15} strokeWidth={2} style={{ color: token.colorTextSecondary }} />
        <Text strong type="secondary" style={{ fontSize: 13 }}>
          {t('feed.filter')}
        </Text>
      </Flex>
      <Segmented
        value={value}
        onChange={(next) => onChange(next as FeedFilterValue)}
        block={!screens.md}
        options={[
          { label: label(List, t('feed.filterAll')), value: 'all' },
          { label: label(Newspaper, t('feed.filterPosts')), value: 'post' },
          { label: label(FolderKanban, t('feed.filterProjects')), value: 'project' },
        ]}
      />
    </Flex>
  );
};

export default FeedFilter;
