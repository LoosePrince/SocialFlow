import React from 'react';
import { Grid, Typography, theme, Flex } from 'antd';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { SITE_COPYRIGHT, THIRD_PARTY_LINKS } from '../siteMeta';
import { useI18n } from '../context/I18nContext';

const { Text, Link: TypographyLink } = Typography;
const { useBreakpoint } = Grid;

const SiteFooter: React.FC = () => {
  const screens = useBreakpoint();
  const { token } = theme.useToken();
  const { t } = useI18n();

  if (!screens.md) {
    return null;
  }

  return (
    <footer
      style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: '24px 16px 32px',
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        marginTop: 'auto',
      }}
    >
      <Flex vertical gap={12} align="center" style={{ textAlign: 'center' }}>
        <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
          {SITE_COPYRIGHT}
        </Text>
        <Flex wrap="wrap" justify="center" gap="8px 16px" align="center">
          {THIRD_PARTY_LINKS.map((item) => (
            <TypographyLink
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {item.label}
              <ExternalLink size={12} aria-hidden />
            </TypographyLink>
          ))}
        </Flex>
        <Link
          to="/about"
          style={{
            fontSize: 13,
            color: token.colorPrimary,
            textDecoration: 'none',
          }}
        >
          {t('about.title')}
        </Link>
      </Flex>
    </footer>
  );
};

export default SiteFooter;
