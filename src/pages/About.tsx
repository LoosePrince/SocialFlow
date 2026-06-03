import React from 'react';
import { Typography, theme, Divider, Flex } from 'antd';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { REPO_URL, SITE_COPYRIGHT_KEY, THIRD_PARTY_LINKS } from '../siteMeta';
import { useI18n } from '../context/I18nContext';

const { Title, Paragraph, Text, Link } = Typography;

const About: React.FC = () => {
  const { token } = theme.useToken();
  const { t } = useI18n();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 680, margin: '0 auto' }}
    >
      <Title level={2} style={{ marginBottom: 16 }}>
        {t('about.title')}
      </Title>
      <Paragraph style={{ fontSize: 16, lineHeight: 1.75, color: token.colorText }}>
        {t('about.intro')}
      </Paragraph>
      <Title level={4} style={{ marginTop: 24, marginBottom: 12 }}>
        {t('about.techStack')}
      </Title>
      <Paragraph style={{ lineHeight: 1.8 }}>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>{t('about.stack.frontend')}</li>
          <li>{t('about.stack.backend')}</li>
          <li>{t('about.stack.authData')}</li>
          <li>{t('about.stack.realtime')}</li>
        </ul>
      </Paragraph>
      <Paragraph style={{ marginTop: 16 }}>
        <Text strong>{t('about.repo')}</Text>
        <Link href={REPO_URL} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8 }}>
          {REPO_URL}
          <ExternalLink size={14} style={{ marginLeft: 4, verticalAlign: 'middle' }} aria-hidden />
        </Link>
      </Paragraph>

      <Divider style={{ margin: '28px 0' }} />

      <Title level={5} style={{ marginBottom: 12 }}>
        {t('about.copyright')}
      </Title>
      <Text type="secondary" style={{ fontSize: 14 }}>
        {t(SITE_COPYRIGHT_KEY)}
      </Text>

      <Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
        {t('about.thirdParty')}
      </Title>
      <Flex vertical gap={8}>
        {THIRD_PARTY_LINKS.map((item) => (
          <Link key={item.href} href={item.href} target="_blank" rel="noopener noreferrer">
            {t(item.labelKey)}
            <ExternalLink size={14} style={{ marginLeft: 6, verticalAlign: 'middle' }} aria-hidden />
          </Link>
        ))}
      </Flex>
    </motion.div>
  );
};

export default About;
