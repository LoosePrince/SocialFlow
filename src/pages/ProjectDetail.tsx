import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiJson } from '../lib/api';
import { Typography, Button, Tag, Divider, Flex, theme, Card, Grid } from 'antd';
import { ProjectDetailPageSkeleton } from '../components/PageSkeletons';
import { GithubCdnAvatar } from '../components/GithubCdnAvatar';
import { GithubCdnImg } from '../components/GithubCdnImg';
import { ArrowLeft, Clock, ExternalLink } from 'lucide-react';
import { getGithubUrl } from '../github';
import CommentSection from '../components/CommentSection';
import dayjs from 'dayjs';
import { toMillis } from '../lib/time';
import { motion } from 'framer-motion';
import type { Components } from 'react-markdown';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const ProjectDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { token } = theme.useToken();
  const screens = useBreakpoint();

  const markdownComponents = useMemo<Components>(
    () => ({
      h1: ({ children }) => (
        <Title level={3} style={{ marginTop: '1.25em', marginBottom: '0.5em' }}>
          {children}
        </Title>
      ),
      h2: ({ children }) => (
        <Title level={4} style={{ marginTop: '1.1em', marginBottom: '0.45em' }}>
          {children}
        </Title>
      ),
      h3: ({ children }) => (
        <Title level={5} style={{ marginTop: '1em', marginBottom: '0.4em' }}>
          {children}
        </Title>
      ),
      h4: ({ children }) => (
        <Text strong style={{ display: 'block', fontSize: 16, marginTop: '0.9em', marginBottom: '0.35em' }}>
          {children}
        </Text>
      ),
      h5: ({ children }) => (
        <Text strong style={{ display: 'block', fontSize: 15, marginTop: '0.85em', marginBottom: '0.3em' }}>
          {children}
        </Text>
      ),
      h6: ({ children }) => (
        <Text type="secondary" strong style={{ display: 'block', fontSize: 14, marginTop: '0.8em', marginBottom: '0.25em' }}>
          {children}
        </Text>
      ),
      p: ({ children }) => (
        <p style={{ margin: '0.75em 0', fontSize: 16, lineHeight: 1.8, color: token.colorText }}>{children}</p>
      ),
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: token.colorLink }}>
          {children}
        </a>
      ),
      ul: ({ children }) => (
        <ul style={{ margin: '0.75em 0', paddingLeft: 24, color: token.colorText, lineHeight: 1.8 }}>{children}</ul>
      ),
      ol: ({ children }) => (
        <ol style={{ margin: '0.75em 0', paddingLeft: 24, color: token.colorText, lineHeight: 1.8 }}>{children}</ol>
      ),
      li: ({ children }) => <li style={{ margin: '0.25em 0' }}>{children}</li>,
      blockquote: ({ children }) => (
        <blockquote
          style={{
            margin: '1em 0',
            padding: '0.5em 1em',
            borderLeft: `4px solid ${token.colorBorderSecondary}`,
            background: token.colorFillQuaternary,
            color: token.colorTextSecondary,
          }}
        >
          {children}
        </blockquote>
      ),
      code: ({ className, children, ...props }) => {
        const inline = !className;
        if (inline) {
          return (
            <code
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.9em',
                padding: '2px 6px',
                borderRadius: token.borderRadiusSM,
                background: token.colorFillQuaternary,
              }}
              {...props}
            >
              {children}
            </code>
          );
        }
        return (
          <code className={className} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14 }} {...props}>
            {children}
          </code>
        );
      },
      pre: ({ children }) => (
        <pre
          style={{
            margin: '1em 0',
            padding: 16,
            overflow: 'auto',
            borderRadius: token.borderRadius,
            background: token.colorFillQuaternary,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {children}
        </pre>
      ),
      hr: () => <Divider style={{ margin: '1.5em 0' }} />,
      table: ({ children }) => (
        <div style={{ overflowX: 'auto', margin: '1em 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead style={{ background: token.colorFillQuaternary }}>{children}</thead>,
      th: ({ children }) => (
        <th
          style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            padding: '8px 12px',
            textAlign: 'left',
            fontWeight: 600,
          }}
        >
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td style={{ border: `1px solid ${token.colorBorderSecondary}`, padding: '8px 12px' }}>{children}</td>
      ),
      img: ({ src, alt }) => (
        <GithubCdnImg src={src} alt={alt ?? ''} style={{ maxWidth: '100%', height: 'auto', borderRadius: token.borderRadius }} />
      ),
    }),
    [token]
  );

  useEffect(() => {
    const fetchProject = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiJson<{
          profiles?: { displayname?: string; photourl?: string };
          coverurl?: string;
          attachments?: string[];
        }>(`/api/projects/${id}`);
        const authorPhoto = data.profiles?.photourl || '';
        setProject({
          ...data,
          authorName: data.profiles?.displayname,
          authorPhoto: authorPhoto.startsWith('http') ? authorPhoto : getGithubUrl(authorPhoto),
          coverUrl: data.coverurl ? getGithubUrl(data.coverurl) : '',
          attachments: (data.attachments as string[] || []).map(getGithubUrl),
        });
      } catch {
        setProject(null);
      }
      setLoading(false);
    };

    void fetchProject();
  }, [id]);

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ width: '100%', maxWidth: 800, margin: '0 auto' }}>
        <ProjectDetailPageSkeleton />
      </motion.div>
    );
  }
  if (!project) return <div style={{ padding: '20px', textAlign: 'center' }}>项目不存在</div>;

  const projectTimeMs = toMillis(project.createdat);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ 
        width: '100%',
        maxWidth: 800,
        margin: '0 auto' 
      }}
    >
      <Button 
        type="text"
        icon={<ArrowLeft size={16}/>} 
        onClick={() => navigate(-1)} 
        style={{ marginBottom: 16, color: token.colorTextSecondary }}
      >
        返回
      </Button>
      
      <Card 
        variant="borderless"
        style={{ 
          padding: 0, 
          overflow: 'hidden',
          boxShadow: screens.md ? token.boxShadow : 'none',
          borderRadius: screens.md ? token.borderRadiusLG : 0,
          background: screens.md ? token.colorBgContainer : 'transparent'
        }}
        styles={{ body: { padding: 0 } }}
      >
        {project.coverUrl && (
          <div style={{ 
            width: '100%', 
            maxHeight: 400, 
            overflow: 'hidden'
          }}>
            <GithubCdnImg 
              src={project.coverUrl} 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
              alt="cover" 
            />
          </div>
        )}
        
        <div style={{ padding: screens.md ? 32 : 16 }}>
          <Tag color={token.colorPrimary} style={{ marginBottom: 12 }}>项目方案</Tag>
          <Title level={screens.md ? 1 : 2} style={{ marginTop: 0 }}>{project.title}</Title>
          <Paragraph type="secondary" style={{ fontSize: screens.md ? 18 : 16 }}>{project.summary}</Paragraph>
          
          <Divider />
          
          <Flex align="center" gap={12} style={{ marginBottom: 32 }}>
            <GithubCdnAvatar src={project.authorPhoto} size="large" />
            <Flex vertical>
              <Text strong>{project.authorName}</Text>
              <Flex align="center" gap={4}>
                <Clock size={12} style={{ color: token.colorTextDescription }} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {projectTimeMs != null ? dayjs(projectTimeMs).format('YYYY-MM-DD HH:mm') : '—'}
                </Text>
              </Flex>
            </Flex>
          </Flex>

          <div style={{ fontSize: 16, lineHeight: 1.8, color: token.colorText }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {typeof project.content === 'string' ? project.content : ''}
            </ReactMarkdown>
          </div>

          {project.attachments.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <Title level={4}>附件资源</Title>
              <Flex gap={12} wrap="wrap">
                {project.attachments.map((url: string, idx: number) => (
                  <Button 
                    key={idx} 
                    type="default" 
                    icon={<ExternalLink size={14}/>} 
                    href={url} 
                    target="_blank"
                    style={{ borderRadius: token.borderRadius }}
                  >
                    查看资源 {idx + 1}
                  </Button>
                ))}
              </Flex>
            </div>
          )}
        </div>
      </Card>

      <div style={{ marginTop: 24, padding: screens.md ? 0 : 16 }}>
        <CommentSection contentId={project.id} contentType="project" />
      </div>
    </motion.div>
  );
};

export default ProjectDetail;
