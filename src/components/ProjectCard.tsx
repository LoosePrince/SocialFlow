import React, { useState } from 'react';
import { Card, Tag, Space, Button, App, Popover, Flex, Typography, theme, Modal, Input } from 'antd';
import { GithubCdnAvatar } from './GithubCdnAvatar';
import { GithubCdnImg } from './GithubCdnImg';
import { Rocket, Clock, MessageSquare, MoreHorizontal, ShieldCheck, Pencil, Heart, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
      message.success(data.isrecommended ? '已推荐项目' : '已取消推荐');
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    modal.confirm({
      title: '确定要删除这个项目吗？',
      content: '删除后无法恢复，且相关动态和评论可能受到影响',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiJson(`/api/projects/${project.id}`, { method: 'DELETE' });
          message.success('已删除');
        } catch {
          message.error('删除失败');
        }
      }
    });
  };

  const shareUrl = `${window.location.origin}/project/${project.id}`;
  const shareMailTo = `mailto:?subject=${encodeURIComponent(`分享一个项目：${project.title ?? ''}`)}&body=${encodeURIComponent(shareUrl)}`;

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      message.success('链接已复制');
    } catch {
      message.error('复制失败，请手动复制');
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
            <Tag color={token.colorPrimary} icon={<Rocket size={12} />}>项目方案</Tag>
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
          <Text type="secondary" style={{ fontSize: 12 }}>分享</Text>
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
                  编辑
                </Button>
                {isAdmin && (
                  <Button type="text" onClick={toggleRecommendation} style={{ textAlign: 'left' }}>
                    {project.isrecommended ? '取消推荐' : '推荐到首页'}
                  </Button>
                )}
                <Button type="text" danger onClick={handleDelete} style={{ textAlign: 'left' }}>
                  删除内容
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
        title="分享项目"
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Flex vertical gap={12}>
          <Input value={shareUrl} readOnly />
          <Flex gap={8}>
            <Button type="primary" onClick={() => void handleCopyShareLink()}>
              复制链接
            </Button>
            <Button href={shareMailTo}>
              通过邮件分享
            </Button>
          </Flex>
        </Flex>
      </Modal>
    </Card>
  );
};

export default ProjectCard;
