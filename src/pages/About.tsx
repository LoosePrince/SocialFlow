import React from 'react';
import { Typography, theme, Divider, Flex } from 'antd';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { REPO_URL, SITE_COPYRIGHT, THIRD_PARTY_LINKS } from '../siteMeta';

const { Title, Paragraph, Text, Link } = Typography;

const About: React.FC = () => {
  const { token } = theme.useToken();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 680, margin: '0 auto' }}
    >
      <Title level={2} style={{ marginBottom: 16 }}>
        关于 SocialFlow
      </Title>
      <Paragraph style={{ fontSize: 16, lineHeight: 1.75, color: token.colorText }}>
        SocialFlow 是一个简约风格的信息分享与社交互动平台，支持动态、项目展示、点赞评论与实时通知等能力。
      </Paragraph>
      <Title level={4} style={{ marginTop: 24, marginBottom: 12 }}>
        技术栈
      </Title>
      <Paragraph style={{ lineHeight: 1.8 }}>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            <Text strong>前端</Text>：React（TypeScript）、Vite、Ant Design / Ant Design Mobile、Framer Motion
          </li>
          <li>
            <Text strong>后端</Text>：Hono（Node）、<Text code>postgres</Text> 直连数据库、<Text code>jose</Text> 校验 JWT
          </li>
          <li>
            <Text strong>认证与数据</Text>：Supabase Auth（如 GitHub OAuth）；业务数据存于 PostgreSQL；媒体可通过后端转存至 GitHub 仓库
          </li>
          <li>
            <Text strong>实时</Text>：服务端 SSE，配合 Postgres <Text code>NOTIFY</Text> 推送数据变更
          </li>
        </ul>
      </Paragraph>
      <Paragraph style={{ marginTop: 16 }}>
        <Text strong>项目仓库：</Text>
        <Link href={REPO_URL} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8 }}>
          {REPO_URL}
          <ExternalLink size={14} style={{ marginLeft: 4, verticalAlign: 'middle' }} aria-hidden />
        </Link>
      </Paragraph>

      <Divider style={{ margin: '28px 0' }} />

      <Title level={5} style={{ marginBottom: 12 }}>
        版权
      </Title>
      <Text type="secondary" style={{ fontSize: 14 }}>
        {SITE_COPYRIGHT}
      </Text>

      <Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
        第三方链接
      </Title>
      <Flex vertical gap={8}>
        {THIRD_PARTY_LINKS.map((item) => (
          <Link key={item.href} href={item.href} target="_blank" rel="noopener noreferrer">
            {item.label}
            <ExternalLink size={14} style={{ marginLeft: 6, verticalAlign: 'middle' }} aria-hidden />
          </Link>
        ))}
      </Flex>
    </motion.div>
  );
};

export default About;
