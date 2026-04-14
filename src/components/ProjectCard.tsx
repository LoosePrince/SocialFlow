import React, { useState } from 'react';
import { Card, Tag, Space, Button, App, Popover, Flex, Typography, theme, Modal, Input } from 'antd';
import { GithubCdnAvatar } from './GithubCdnAvatar';
import { GithubCdnImg } from './GithubCdnImg';
import { Rocket, Clock, MessageSquare, MoreHorizontal, ShieldCheck, Pencil, Heart, Share2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { apiJson } from '../lib/api';
import { toMillis } from '../lib/time';
import dayjs from 'dayjs';

const { Text } = Typography;

interface ProjectCardProps {
  project: any;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project }) => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const [shareOpen, setShareOpen] = useState(false);

  const isOwner = user?.id === project.authorid;
  const canManage = isAdmin || isOwner;
  const createdAtMs = toMillis(project.createdat);

  const toggleRecommendation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const data = await apiJson<{ isrecommended?: boolean }>(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isrecommended: !project.isrecommended }),
      });
      message.success(data.isrecommended ? t('project.recommendSuccessOn') : t('project.recommendSuccessOff'));
    } catch {
      message.error(t('project.actionFailed'));
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    modal.confirm({
      title: t('project.deleteConfirmTitle'),
      content: t('project.deleteConfirmContent'),
      okText: t('project.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await apiJson(`/api/projects/${project.id}`, { method: 'DELETE' });
          message.success(t('project.deleted'));
        } catch {
          message.error(t('project.deleteFailed'));
        }
      }
    });
  };

  const shareUrl = `${window.location.origin}/project/${project.id}`;
  const shareMailTo = `mailto:?subject=${encodeURIComponent(`${t('share.projectTitle')}：${project.title ?? ''}`)}&body=${encodeURIComponent(shareUrl)}`;

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      message.success(t('share.linkCopied'));
    } catch {
      message.error(t('share.copyFailed'));
    }
  };

  return (
    <Card
      hoverable
      style={{
        marginBottom: 16,
        overflow: 'hidden',
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG
      }}
      cover={
        <div
          onClick={() => navigate(`/project/${project.id}`)}
          style={{
            position: 'relative',
            height: 180,
            overflow: 'hidden',
            cursor: 'pointer'
          }}
        >
          <GithubCdnImg
            alt={project.title}
            src={project.coverurl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.3s'
            }}
          />
          <div style={{ position: 'absolute', top: 12, left: 12 }}>
            <Tag color={token.colorPrimary} icon={<Rocket size={12} />}>{t('project.scheme')}</Tag>
          </div>
        </div>
      }
      actions={[
        <Flex justify="center" align="center" gap={4} onClick={() => navigate(`/project/${project.id}`)} style={{ cursor: 'pointer' }}>
          <Clock size={14} />
          <Text type="secondary" style={{ fontSize: 12 }}>{createdAtMs != null ? dayjs(createdAtMs).fromNow() : '—'}</Text>
        </Flex>,
        <Flex justify="center" align="center" gap={4} onClick={() => navigate(`/project/${project.id}`)} style={{ cursor: 'pointer' }}>
          <Heart size={14} />
          <Text type="secondary" style={{ fontSize: 12 }}>{(project.likecount ?? project.likeCount) || 0}</Text>
        </Flex>,
        <Flex justify="center" align="center" gap={4} onClick={() => navigate(`/project/${project.id}`)} style={{ cursor: 'pointer' }}>
          <MessageSquare size={14} />
          <Text type="secondary" style={{ fontSize: 12 }}>{(project.commentcount ?? project.commentCount) || 0}</Text>
        </Flex>,
        <Flex
          justify="center"
          align="center"
          gap={4}
          onClick={() => setShareOpen(true)}
          style={{ cursor: 'pointer' }}
        >
          <Share2 size={14} />
          <Text type="secondary" style={{ fontSize: 12 }}>{t('share.short')}</Text>
        </Flex>,
        canManage ? (
          <Popover
            placement="topRight"
            content={
              <Flex vertical gap={4}>
                <Button
                  type="text"
                  icon={<Pencil size={14} />}
                  style={{ textAlign: 'left' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/create?edit=${encodeURIComponent(project.id)}&type=project`);
                  }}
                >
                  {t('project.edit')}
                </Button>
                {isAdmin && (
                  <Button
                    type="text"
                    icon={<ShieldCheck size={14} />}
                    onClick={toggleRecommendation}
                    style={{ textAlign: 'left' }}
                  >
                    {project.isrecommended ? t('project.recommendOff') : t('project.recommendOn')}
                  </Button>
                )}
                <Button
                  type="text"
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={handleDelete}
                  style={{ textAlign: 'left' }}
                >
                  {t('project.delete')}
                </Button>
              </Flex>
            }
            trigger="click"
          >
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'center' }}>
              <MoreHorizontal size={18} />
            </div>
          </Popover>
        ) : null
      ].filter(Boolean) as any}
    >
      <Card.Meta
        avatar={
          <GithubCdnAvatar
            src={project.authorPhoto}
            onClick={(e) => { e?.stopPropagation(); navigate(`/profile/${project.authorid}`); }}
            style={{ cursor: 'pointer' }}
          />
        }
        title={
          <Flex align="center" gap={8}>
            <Text
              strong
              onClick={() => navigate(`/project/${project.id}`)}
              style={{ cursor: 'pointer', fontSize: 16 }}
            >
              {project.title}
            </Text>
            {project.isrecommended && <ShieldCheck size={14} style={{ color: token.colorPrimary }} />}
          </Flex>
        }
        description={
          <div style={{
            marginTop: 8,
            color: token.colorTextSecondary,
            fontSize: 14,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}>
            {project.summary}
          </div>
        }
      />

      <Modal
        title={t('share.projectTitle')}
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Flex vertical gap={12}>
          <Input value={shareUrl} readOnly />
          <Flex gap={8}>
            <Button type="primary" onClick={() => void handleCopyShareLink()}>
              {t('share.copyLink')}
            </Button>
            <Button href={shareMailTo}>
              {t('share.byEmail')}
            </Button>
          </Flex>
        </Flex>
      </Modal>
    </Card>
  );
};

export default ProjectCard;
