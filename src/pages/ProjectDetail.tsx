import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiJson, onApiCacheUpdate } from '../lib/api';
import { Typography, Button, Tag, Divider, Flex, theme, Card, Grid } from 'antd';
import { ProjectDetailPageSkeleton } from '../components/PageSkeletons';
import { GithubCdnAvatar } from '../components/GithubCdnAvatar';
import { GithubCdnImg } from '../components/GithubCdnImg';
import ProjectMarkdownContent from '../components/ProjectMarkdownContent';
import { ArrowLeft, Clock, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { getGithubUrl } from '../github';
import CommentSection from '../components/CommentSection';
import CommentText from '../components/CommentText';
import AttachmentList from '../components/AttachmentList';
import dayjs from 'dayjs';
import { toMillis } from '../lib/time';
import { motion } from 'framer-motion';
import {
  legacyFileAssetFromPath,
  mergeFileAssetsByPath,
  type FileAsset,
} from '../lib/files';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

type ProjectDetailData = {
  profiles?: { displayname?: string; photourl?: string };
  coverurl?: string;
  attachments?: string[];
  fileattachments?: FileAsset[];
};

function normalizeProject(data: ProjectDetailData) {
  const authorPhoto = data.profiles?.photourl || '';
  const oldAttachments = ((data.attachments as string[]) || []).map((path) => legacyFileAssetFromPath(path));
  return {
    ...data,
    authorName: data.profiles?.displayname,
    authorPhoto: getGithubUrl(authorPhoto),
    coverUrl: data.coverurl ? getGithubUrl(data.coverurl) : '',
    attachments: mergeFileAssetsByPath([...(data.fileattachments ?? []), ...oldAttachments]),
  };
}

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
    const path = id ? `/api/projects/${id}` : '';
    const fetchProject = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiJson<ProjectDetailData>(path);
        setProject(normalizeProject(data));
      } catch {
        setProject(null);
      }
      setLoading(false);
    };

    void fetchProject();
    if (!path) return undefined;
    const unsubCache = onApiCacheUpdate<ProjectDetailData>(path, (data) => {
      setProject(normalizeProject(data));
      setLoading(false);
    });
    return () => unsubCache();
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
      <Flex
        justify="space-between"
        align="center"
        style={{
          marginBottom: 16,
          position: screens.md ? 'static' : 'sticky',
          top: 64,
          zIndex: 6,
          background: token.colorBgLayout,
          padding: screens.md ? 0 : '8px 0',
        }}
        wrap="wrap"
        gap={8}
      >
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
            type="text"
            icon={<Pencil size={16} strokeWidth={2} />}
            onClick={() => navigate(`/create?edit=${encodeURIComponent(project.id)}&type=project`)}
            style={{ color: token.colorTextSecondary }}
          >
            {t('detail.edit')}
          </Button>
        )}
      </Flex>
      
      <Card 
        className="sf-card"
        variant="borderless"
        style={{ 
          padding: 0, 
          overflow: 'hidden',
          boxShadow: screens.md ? 'var(--sf-subtle-shadow)' : 'none',
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
          <Title level={screens.md ? 1 : 2} style={{ marginTop: 0 }}>
            <CommentText text={project.title ?? ''} />
          </Title>
          <Paragraph type="secondary" style={{ fontSize: screens.md ? 18 : 16 }}>
            <CommentText text={project.summary ?? ''} />
          </Paragraph>
          
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
              <AttachmentList attachments={project.attachments} />
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
