import React, { useState, useEffect } from 'react';
import { App, Tabs, Form, Input, Upload, Button, Space, Typography, theme, Grid, Switch, Spin, Segmented, Flex, Divider } from 'antd';
import type { UploadFile } from 'antd';
import { ImagePlus, Type, FileText, Send, Projector, Eye } from 'lucide-react';
import { uploadToGithub, getGithubUrl } from '../github';
import { useAuth } from '../context/AuthContext';
import { apiJson } from '../lib/api';
import PostBodyDisplay from './PostBodyDisplay';
import ProjectMarkdownContent from './ProjectMarkdownContent';
import SmartFeedImage from './SmartFeedImage';

const { Title, Paragraph, Text } = Typography;
const { useBreakpoint } = Grid;

type PathFile = UploadFile & { path?: string };

export type CreatePanelVariant = 'modal' | 'page';

export interface CreatePanelProps {
  variant?: CreatePanelVariant;
  /** 发布或保存成功后的回调（弹窗关闭、页面跳转等） */
  onSuccess: () => void;
  /** 编辑已有动态或项目 */
  editTarget?: { kind: 'post' | 'project'; id: string };
}

async function pathsFromUploadList(
  files: UploadFile[],
  upload: (f: File) => Promise<string>
): Promise<string[]> {
  return Promise.all(
    files.map(async (f) => {
      const pf = f as PathFile;
      if (f.originFileObj) return upload(f.originFileObj as File);
      if (pf.path) return pf.path;
      throw new Error('部分图片缺少路径，请移除后重新上传');
    })
  );
}

const CreatePanel: React.FC<CreatePanelProps> = ({ variant = 'modal', onSuccess, editTarget }) => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(!!editTarget);
  const [postForm] = Form.useForm();
  const [projectForm] = Form.useForm();
  const [postFileList, setPostFileList] = useState<UploadFile[]>([]);
  const [projectFileList, setProjectFileList] = useState<UploadFile[]>([]);
  const [activeTab, setActiveTab] = useState<'post' | 'project'>(
    editTarget?.kind ?? 'post'
  );
  const [postBodyMode, setPostBodyMode] = useState<'edit' | 'preview'>('edit');
  const [projectBodyMode, setProjectBodyMode] = useState<'edit' | 'preview'>('edit');
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const isPageMobile = variant === 'page' && !screens.md;

  useEffect(() => {
    if (editTarget) {
      setActiveTab(editTarget.kind);
    }
  }, [editTarget]);

  useEffect(() => {
    setPostBodyMode('edit');
    setProjectBodyMode('edit');
  }, [activeTab]);

  const watchedPostContent = Form.useWatch('content', postForm) as string | undefined;
  const watchedProjectTitle = Form.useWatch('title', projectForm) as string | undefined;
  const watchedProjectSummary = Form.useWatch('summary', projectForm) as string | undefined;
  const watchedProjectContent = Form.useWatch('projectContent', projectForm) as string | undefined;

  useEffect(() => {
    if (!editTarget || !user) {
      setLoadingEdit(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingEdit(true);
      try {
        if (editTarget.kind === 'post') {
          const data = await apiJson<{
            content: string;
            images?: unknown;
            isrecommended?: boolean;
          }>(`/api/posts/${editTarget.id}`);
          if (cancelled) return;
          const imgs = Array.isArray(data.images) ? (data.images as string[]) : [];
          postForm.setFieldsValue({
            content: data.content,
            ...(isAdmin ? { isrecommended: !!data.isrecommended } : {}),
          });
          setPostFileList(
            imgs.map(
              (p, i) =>
                ({
                  uid: `exist-p-${i}`,
                  name: p.split('/').pop() || `img-${i}`,
                  status: 'done' as const,
                  url: getGithubUrl(p),
                  path: p,
                }) as PathFile
            )
          );
        } else {
          const data = await apiJson<{
            title: string;
            summary?: string;
            content: string;
            coverurl?: string;
            attachments?: unknown;
            isrecommended?: boolean;
          }>(`/api/projects/${editTarget.id}`);
          if (cancelled) return;
          const atts = Array.isArray(data.attachments) ? (data.attachments as string[]) : [];
          projectForm.setFieldsValue({
            title: data.title,
            summary: data.summary ?? '',
            projectContent: data.content,
            ...(isAdmin ? { isrecommended: !!data.isrecommended } : {}),
          });
          const list: UploadFile[] = [];
          if (data.coverurl) {
            list.push({
              uid: 'exist-cover',
              name: data.coverurl.split('/').pop() || 'cover',
              status: 'done',
              url: getGithubUrl(data.coverurl),
              path: data.coverurl,
            } as PathFile);
          }
          atts.forEach((p, i) => {
            list.push({
              uid: `exist-a-${i}`,
              name: p.split('/').pop() || `file-${i}`,
              status: 'done',
              url: getGithubUrl(p),
              path: p,
            } as PathFile);
          });
          setProjectFileList(list);
        }
      } catch {
        message.error('加载内容失败');
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editTarget, user, isAdmin, postForm, projectForm, message]);

  const handleSubmitPost = async (values: { content: string; isrecommended?: boolean }) => {
    if (!user) return;
    setLoading(true);
    try {
      const filePaths = await pathsFromUploadList(postFileList, uploadToGithub);

      if (editTarget?.kind === 'post') {
        await apiJson(`/api/posts/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            content: values.content,
            images: filePaths,
            ...(isAdmin ? { isrecommended: !!values.isrecommended } : {}),
          }),
        });
        message.success('动态已更新');
      } else {
        await apiJson('/api/posts', {
          method: 'POST',
          body: JSON.stringify({
            content: values.content,
            images: filePaths,
            isrecommended: isAdmin ? !!values.isrecommended : false,
          }),
        });
        message.success('动态发布成功');
      }

      postForm.resetFields();
      setPostFileList([]);
      onSuccess();
    } catch (error: unknown) {
      message.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitProject = async (values: {
    title: string;
    summary?: string;
    projectContent: string;
    isrecommended?: boolean;
  }) => {
    if (!user) return;
    setLoading(true);
    try {
      const filePaths = await pathsFromUploadList(projectFileList, uploadToGithub);
      const coverurl = filePaths[0] ?? '';
      const attachments = filePaths.slice(1);

      if (editTarget?.kind === 'project') {
        await apiJson(`/api/projects/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: values.title,
            summary: values.summary ?? '',
            content: values.projectContent,
            coverurl,
            attachments,
            ...(isAdmin ? { isrecommended: !!values.isrecommended } : {}),
          }),
        });
        message.success('项目已更新');
      } else {
        await apiJson('/api/projects', {
          method: 'POST',
          body: JSON.stringify({
            title: values.title,
            summary: values.summary,
            content: values.projectContent,
            coverurl,
            attachments,
            isrecommended: isAdmin ? !!values.isrecommended : false,
          }),
        });
        message.success('项目创建成功');
      }

      projectForm.resetFields();
      setProjectFileList([]);
      onSuccess();
    } catch (error: unknown) {
      message.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const onFinishFailed = () => {
    message.error('请完善表单必填项');
  };

  const touchBtnStyle = isPageMobile ? { minHeight: 48, fontSize: 16 } : undefined;
  const inputFont = { fontSize: 16, lineHeight: 1.55 as const };

  const tabLocked = !!editTarget;

  const tabs = (
    <Tabs
      activeKey={activeTab}
      onChange={(key) => {
        if (tabLocked) return;
        const k = key as 'post' | 'project';
        setActiveTab(k);
        if (k === 'post') setProjectFileList([]);
        else setPostFileList([]);
      }}
      destroyOnHidden={false}
      className={isPageMobile ? 'create-page-tabs' : undefined}
      tabBarStyle={isPageMobile ? { marginBottom: 12, paddingLeft: 0, paddingRight: 0 } : undefined}
      items={[
        {
          key: 'post',
          disabled: editTarget?.kind === 'project',
          label: (
            <Space size={isPageMobile ? 4 : 8}>
              <Type size={isPageMobile ? 17 : 18} /> 动态
            </Space>
          ),
          children: (
            <Form
              form={postForm}
              onFinish={handleSubmitPost}
              onFinishFailed={onFinishFailed}
              layout="vertical"
              requiredMark={false}
            >
              <Flex justify="space-between" align="center" style={{ marginBottom: 10 }} wrap="wrap" gap={8}>
                <Segmented
                  size={isPageMobile ? 'large' : 'middle'}
                  value={postBodyMode}
                  onChange={(v) => setPostBodyMode(v as 'edit' | 'preview')}
                  options={[
                    {
                      label: (
                        <Space size={4}>
                          <Type size={14} />
                          编辑
                        </Space>
                      ),
                      value: 'edit',
                    },
                    {
                      label: (
                        <Space size={4}>
                          <Eye size={14} />
                          预览
                        </Space>
                      ),
                      value: 'preview',
                    },
                  ]}
                />
              </Flex>
              <Form.Item
                name="content"
                rules={[{ required: true, message: '请输入动态内容' }]}
                hidden={postBodyMode === 'preview'}
              >
                <Input.TextArea
                  placeholder="分享你现在的心情..."
                  rows={isPageMobile ? 6 : variant === 'page' ? 5 : 4}
                  variant={isPageMobile ? 'outlined' : 'borderless'}
                  style={{
                    ...inputFont,
                    minHeight: isPageMobile ? 140 : undefined,
                    resize: 'vertical' as const,
                  }}
                />
              </Form.Item>
              {postBodyMode === 'preview' && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    borderRadius: token.borderRadius,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorFillAlter,
                    minHeight: 80,
                  }}
                >
                  {watchedPostContent?.trim() ? (
                    <PostBodyDisplay
                      text={watchedPostContent}
                      fontSize={isPageMobile ? 16 : 18}
                    />
                  ) : (
                    <Text type="secondary">暂无正文，请在「编辑」中输入</Text>
                  )}
                  {postFileList.length > 0 && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 4,
                        marginTop: 12,
                        maxWidth: 400,
                      }}
                    >
                      {postFileList.map((f) => {
                        const pf = f as PathFile;
                        const src =
                          f.thumbUrl ||
                          f.url ||
                          (pf.path ? getGithubUrl(pf.path) : undefined);
                        if (!src) return null;
                        return (
                          <div
                            key={f.uid}
                            style={{
                              position: 'relative',
                              width: '100%',
                              minWidth: 0,
                            }}
                          >
                            <SmartFeedImage
                              src={src}
                              alt=""
                              layout="gridCell"
                              preview={{ mask: null }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <Form.Item label={isPageMobile ? '图片（最多 9 张）' : '图片 (最多9张)'}>
                <div className={isPageMobile ? 'create-page-upload-scroll' : undefined}>
                  <Upload
                    listType="picture-card"
                    fileList={postFileList}
                    onChange={({ fileList: fl }) => setPostFileList(fl)}
                    beforeUpload={() => false}
                    multiple
                    maxCount={9}
                  >
                    {postFileList.length >= 9 ? null : (
                      <div style={{ padding: isPageMobile ? 4 : undefined }}>
                        <ImagePlus size={isPageMobile ? 22 : 20} />
                        <div style={{ marginTop: 6, fontSize: isPageMobile ? 12 : undefined }}>上传</div>
                      </div>
                    )}
                  </Upload>
                </div>
              </Form.Item>
              {isAdmin && (
                <Form.Item
                  name="isrecommended"
                  label="推荐到首页"
                  valuePropName="checked"
                  initialValue={false}
                >
                  <Switch />
                </Form.Item>
              )}
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
                icon={<Send size={18} />}
                style={touchBtnStyle}
              >
                {editTarget?.kind === 'post' ? '保存动态' : '发布动态'}
              </Button>
            </Form>
          ),
        },
        {
          key: 'project',
          disabled: editTarget?.kind === 'post',
          label: (
            <Space size={isPageMobile ? 4 : 8}>
              <FileText size={isPageMobile ? 17 : 18} /> 项目
            </Space>
          ),
          children: (
            <Form
              form={projectForm}
              onFinish={handleSubmitProject}
              onFinishFailed={onFinishFailed}
              layout="vertical"
              requiredMark={false}
            >
              <Flex justify="space-between" align="center" style={{ marginBottom: 10 }} wrap="wrap" gap={8}>
                <Segmented
                  size={isPageMobile ? 'large' : 'middle'}
                  value={projectBodyMode}
                  onChange={(v) => setProjectBodyMode(v as 'edit' | 'preview')}
                  options={[
                    {
                      label: (
                        <Space size={4}>
                          <FileText size={14} />
                          编辑
                        </Space>
                      ),
                      value: 'edit',
                    },
                    {
                      label: (
                        <Space size={4}>
                          <Eye size={14} />
                          预览
                        </Space>
                      ),
                      value: 'preview',
                    },
                  ]}
                />
              </Flex>
              <Form.Item
                name="title"
                label="项目名称"
                hidden={projectBodyMode === 'preview'}
                rules={[{ required: true, message: '请填写项目标题' }]}
              >
                <Input placeholder="输入项目标题" size="large" style={inputFont} />
              </Form.Item>
              <Form.Item name="summary" label="简短介绍" hidden={projectBodyMode === 'preview'}>
                <Input.TextArea placeholder="简短的项目介绍" rows={isPageMobile ? 3 : 2} style={inputFont} />
              </Form.Item>
              <Form.Item
                name="projectContent"
                label="项目详情 (Markdown)"
                hidden={projectBodyMode === 'preview'}
                rules={[{ required: true, message: '请填写项目详情' }]}
              >
                <Input.TextArea
                  placeholder="支持 Markdown 格式内容"
                  rows={isPageMobile ? 8 : 6}
                  style={{ ...inputFont, minHeight: isPageMobile ? 160 : undefined }}
                />
              </Form.Item>
              {projectBodyMode === 'preview' && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: 16,
                    borderRadius: token.borderRadiusLG,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorFillAlter,
                  }}
                >
                  <Title level={4} style={{ marginTop: 0 }}>
                    {watchedProjectTitle?.trim() ? watchedProjectTitle : '（无标题）'}
                  </Title>
                  <Paragraph type="secondary" style={{ fontSize: isPageMobile ? 15 : 16, marginBottom: 12 }}>
                    {watchedProjectSummary?.trim()
                      ? watchedProjectSummary
                      : '（暂无简介）'}
                  </Paragraph>
                  <Divider style={{ margin: '12px 0' }} />
                  {watchedProjectContent?.trim() ? (
                    <ProjectMarkdownContent markdown={watchedProjectContent} />
                  ) : (
                    <Text type="secondary">暂无详情正文，请在「编辑」中填写</Text>
                  )}
                </div>
              )}
              <Form.Item label="资源列表（首张为封面图）">
                <Upload
                  listType="picture"
                  fileList={projectFileList}
                  onChange={({ fileList: fl }) => setProjectFileList(fl)}
                  beforeUpload={() => false}
                  multiple
                  className={isPageMobile ? 'create-page-project-upload' : undefined}
                >
                  <Button
                    icon={<ImagePlus size={16} />}
                    block={isPageMobile}
                    size="large"
                    style={isPageMobile ? { height: 44 } : undefined}
                  >
                    上传资源
                  </Button>
                </Upload>
              </Form.Item>
              {isAdmin && (
                <Form.Item
                  name="isrecommended"
                  label="推荐到首页"
                  valuePropName="checked"
                  initialValue={false}
                >
                  <Switch />
                </Form.Item>
              )}
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
                icon={<Projector size={18} />}
                style={touchBtnStyle}
              >
                {editTarget?.kind === 'project' ? '保存项目' : '创建项目'}
              </Button>
            </Form>
          ),
        },
      ]}
    />
  );

  const tabsWithLoadingOverlay = (
    <div style={{ position: 'relative', minHeight: loadingEdit ? (variant === 'modal' ? 280 : 320) : undefined }}>
      {tabs}
      {loadingEdit && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: token.colorBgMask,
            borderRadius: token.borderRadiusLG,
          }}
        >
          <Spin size="large" />
        </div>
      )}
    </div>
  );

  if (variant === 'modal') {
    return tabsWithLoadingOverlay;
  }

  if (isPageMobile) {
    return <div style={{ paddingTop: 0 }}>{tabsWithLoadingOverlay}</div>;
  }

  const pageTitle = editTarget
    ? editTarget.kind === 'post'
      ? '编辑动态'
      : '编辑项目'
    : '发布内容';
  const pageDesc = editTarget
    ? '修改正文与资源后保存'
    : '分享动态或创建项目';

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ marginBottom: 8 }}>
          {pageTitle}
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {pageDesc}
        </Paragraph>
      </div>
      <div
        style={{
          background: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          boxShadow: token.boxShadowSecondary,
          border: `1px solid ${token.colorBorderSecondary}`,
          padding: 20,
        }}
      >
        {tabsWithLoadingOverlay}
      </div>
    </>
  );
};

export default CreatePanel;
