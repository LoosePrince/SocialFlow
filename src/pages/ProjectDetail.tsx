import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiJson } from '../lib/api';
import { Typography, Button, Tag, Divider, Flex, theme, Card, Grid } from 'antd';
import { ProjectDetailPageSkeleton } from '../components/PageSkeletons';
import { GithubCdnAvatar } from '../components/GithubCdnAvatar';
import { GithubCdnImg } from '../components/GithubCdnImg';
import ProjectMarkdownContent from '../components/ProjectMarkdownContent';
import { ArrowLeft, Clock, ExternalLink, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { getGithubUrl } from '../github';
import CommentSection from '../components/CommentSection';
import dayjs from 'dayjs';
import { toMillis } from '../lib/time';
import { motion } from 'framer-motion';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const ProjectDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const canEditProject = project && (isAdmin || user?.id === project.authorid);

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
          authorPhoto: getGithubUrl(authorPhoto),
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
  if (!project) return <div style={{ padding: '20px', textAlign: 'center' }}>{t('project.notFound')}</div>;

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
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }} wrap="wrap" gap={8}>
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => navigate(-1)}
          style={{ color: token.colorTextSecondary }}
        >
          {t('detail.back')}
        </Button>
        {canEditProject && (
          <Button
            color="primary"
            variant="outlined"
            icon={<Pencil size={16} strokeWidth={2} />}
            onClick={() => navigate(`/create?edit=${encodeURIComponent(project.id)}&type=project`)}
          >
            {t('detail.edit')}
          </Button>
        )}
      </Flex>
      
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
          <Tag color={token.colorPrimary} style={{ marginBottom: 12 }}>{t('project.scheme')}</Tag>
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

          <ProjectMarkdownContent markdown={typeof project.content === 'string' ? project.content : ''} />

          {project.attachments.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <Title level={4}>{t('project.attachments')}</Title>
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
                    {t('project.viewResource')} {idx + 1}
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
