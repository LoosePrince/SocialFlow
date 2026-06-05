import React, { useState, useEffect, useRef } from 'react';
import { App, Tabs, Form, Input, Upload, Button, Space, Typography, theme, Grid, Switch, Spin, Segmented, Flex, Divider, Modal } from 'antd';
import type { UploadFile } from 'antd';
import { ImagePlus, Type, FileText, Send, Projector, Eye } from 'lucide-react';
import { uploadToGithub, getGithubUrl } from '../github';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { apiJson } from '../lib/api';
import PostBodyDisplay from './PostBodyDisplay';
import ProjectMarkdownContent from './ProjectMarkdownContent';
import SmartFeedImage from './SmartFeedImage';

const { Title, Paragraph, Text } = Typography;
const { useBreakpoint } = Grid;

type PathFile = UploadFile & { path?: string; localPreview?: string };

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
  const paths: string[] = [];
  for (const f of files) {
    const pf = f as PathFile;
    if (f.originFileObj) {
      paths.push(await upload(f.originFileObj as File));
      continue;
    }
    if (pf.path) {
      paths.push(pf.path);
      continue;
    }
    throw new Error(`missing path: ${f.name || f.uid}`);
  }
  return paths;
}

function previewSrcFromUploadFile(file: UploadFile): string | undefined {
  const pf = file as PathFile;
  return file.url || file.thumbUrl || pf.localPreview || (pf.path ? getGithubUrl(pf.path) : undefined);
}

const CreatePanel: React.FC<CreatePanelProps> = ({ variant = 'modal', onSuccess, editTarget }) => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(!!editTarget);
  /** 新建动态/项目时与上传目录一致，需在 POST 时带上同一 id */
  const [postDraftId, setPostDraftId] = useState(() => crypto.randomUUID());
  const [projectDraftId, setProjectDraftId] = useState(() => crypto.randomUUID());
  const [postForm] = Form.useForm();
  const [projectForm] = Form.useForm();
  const [postFileList, setPostFileList] = useState<UploadFile[]>([]);
  const [projectFileList, setProjectFileList] = useState<UploadFile[]>([]);
  const [previewImage, setPreviewImage] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const localPreviewUrls = useRef(new Set<string>());
  const [activeTab, setActiveTab] = useState<'post' | 'project'>(
    editTarget?.kind ?? 'post'
  );
  const [postBodyMode, setPostBodyMode] = useState<'edit' | 'preview'>('edit');
  const [projectBodyMode, setProjectBodyMode] = useState<'edit' | 'preview'>('edit');
  const { message } = App.useApp();
  const { t } = useI18n();
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

  const postUploadContentId =
    editTarget?.kind === 'post' ? editTarget.id : postDraftId;
  const projectUploadContentId =
    editTarget?.kind === 'project' ? editTarget.id : projectDraftId;

  useEffect(() => {
    return () => {
      localPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      localPreviewUrls.current.clear();
    };
  }, []);

  const withLocalPreviews = (files: UploadFile[]) =>
    files.map((file) => {
      const pf = file as PathFile;
      if (!pf.localPreview && file.originFileObj instanceof File) {
        const localPreview = URL.createObjectURL(file.originFileObj);
        localPreviewUrls.current.add(localPreview);
        return { ...file, localPreview, thumbUrl: file.thumbUrl || localPreview } as PathFile;
      }
      return file;
    });

  const revokeLocalPreviews = (files: UploadFile[]) => {
    files.forEach((file) => {
      const url = (file as PathFile).localPreview;
      if (url && localPreviewUrls.current.has(url)) {
        URL.revokeObjectURL(url);
        localPreviewUrls.current.delete(url);
      }
    });
  };

  const updatePostFileList = (files: UploadFile[]) => {
    const nextUids = new Set(files.map((file) => file.uid));
    revokeLocalPreviews(postFileList.filter((file) => !nextUids.has(file.uid)));
    setPostFileList(withLocalPreviews(files));
  };

  const updateProjectFileList = (files: UploadFile[]) => {
    const nextUids = new Set(files.map((file) => file.uid));
    revokeLocalPreviews(projectFileList.filter((file) => !nextUids.has(file.uid)));
    setProjectFileList(withLocalPreviews(files));
  };

  const handleUploadPreview = async (file: UploadFile) => {
    const src = previewSrcFromUploadFile(file);
    if (!src) return;
    setPreviewImage(src);
    setPreviewTitle(file.name || src.split('/').pop() || '');
  };

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
        message.error(t('create.loadFailed'));
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
      const filePaths = await pathsFromUploadList(postFileList, (f) =>
        uploadToGithub(f, { scope: 'post', contentId: postUploadContentId })
      );

      if (editTarget?.kind === 'post') {
        await apiJson(`/api/posts/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            content: values.content,
            images: filePaths,
            ...(isAdmin ? { isrecommended: !!values.isrecommended } : {}),
          }),
        });
        message.success(t('create.postUpdated'));
      } else {
        await apiJson('/api/posts', {
          method: 'POST',
          body: JSON.stringify({
            id: postUploadContentId,
            content: values.content,
            images: filePaths,
            isrecommended: isAdmin ? !!values.isrecommended : false,
          }),
        });
        message.success(t('create.postCreated'));
        setPostDraftId(crypto.randomUUID());
      }

      postForm.resetFields();
      updatePostFileList([]);
      onSuccess();
    } catch (error: unknown) {
      message.error(`${t('common.actionFailed')}: ${error instanceof Error ? error.message : String(error)}`);
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
      const filePaths = await pathsFromUploadList(projectFileList, (f) =>
        uploadToGithub(f, { scope: 'project', contentId: projectUploadContentId })
      );
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
        message.success(t('create.projectUpdated'));
      } else {
        await apiJson('/api/projects', {
          method: 'POST',
          body: JSON.stringify({
            id: projectUploadContentId,
            title: values.title,
            summary: values.summary,
            content: values.projectContent,
            coverurl,
            attachments,
            isrecommended: isAdmin ? !!values.isrecommended : false,
          }),
        });
        message.success(t('create.projectCreated'));
        setProjectDraftId(crypto.randomUUID());
      }

      projectForm.resetFields();
      updateProjectFileList([]);
      onSuccess();
    } catch (error: unknown) {
      message.error(`${t('common.actionFailed')}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const onFinishFailed = () => {
    message.error(t('create.formRequired'));
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
        if (k === 'post') updateProjectFileList([]);
        else updatePostFileList([]);
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
              <Type size={isPageMobile ? 17 : 18} /> {t('create.postTab')}
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
                          {t('common.edit')}
                        </Space>
                      ),
                      value: 'edit',
                    },
                    {
                      label: (
                        <Space size={4}>
                          <Eye size={14} />
                          {t('common.preview')}
                        </Space>
                      ),
                      value: 'preview',
                    },
                  ]}
                />
              </Flex>
              <Form.Item
                name="content"
                rules={[{ required: true, message: t('create.postContentRequired') }]}
                hidden={postBodyMode === 'preview'}
              >
                <Input.TextArea
                  placeholder={t('create.postPlaceholder')}
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
                    <Text type="secondary">{t('create.noPostPreview')}</Text>
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
                        const src = previewSrcFromUploadFile(f);
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
              <Form.Item label={t('create.postImages')}>
                <div className={isPageMobile ? 'create-page-upload-scroll' : undefined}>
                  <Upload
                    listType="picture-card"
                    fileList={postFileList}
                    onChange={({ fileList: fl }) => updatePostFileList(fl)}
                    onPreview={handleUploadPreview}
                    beforeUpload={() => false}
                    multiple
                    maxCount={9}
                  >
                    {postFileList.length >= 9 ? null : (
                      <div style={{ padding: isPageMobile ? 4 : undefined }}>
                        <ImagePlus size={isPageMobile ? 22 : 20} />
                        <div style={{ marginTop: 6, fontSize: isPageMobile ? 12 : undefined }}>{t('common.upload')}</div>
                      </div>
                    )}
                  </Upload>
                </div>
              </Form.Item>
              {isAdmin && (
                <Form.Item
                  name="isrecommended"
                  label={t('create.recommend')}
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
                {editTarget?.kind === 'post' ? t('create.savePost') : t('create.publishPost')}
              </Button>
            </Form>
          ),
        },
        {
          key: 'project',
          disabled: editTarget?.kind === 'post',
          label: (
            <Space size={isPageMobile ? 4 : 8}>
              <FileText size={isPageMobile ? 17 : 18} /> {t('create.projectTab')}
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
                          {t('common.edit')}
                        </Space>
                      ),
                      value: 'edit',
                    },
                    {
                      label: (
                        <Space size={4}>
                          <Eye size={14} />
                          {t('common.preview')}
                        </Space>
                      ),
                      value: 'preview',
                    },
                  ]}
                />
              </Flex>
              <Form.Item
                name="title"
                label={t('create.projectTitle')}
                hidden={projectBodyMode === 'preview'}
                rules={[{ required: true, message: t('create.projectTitleRequired') }]}
              >
                <Input placeholder={t('create.projectTitlePlaceholder')} size="large" style={inputFont} />
              </Form.Item>
              <Form.Item name="summary" label={t('create.projectSummary')} hidden={projectBodyMode === 'preview'}>
                <Input.TextArea placeholder={t('create.projectSummaryPlaceholder')} rows={isPageMobile ? 3 : 2} style={inputFont} />
              </Form.Item>
              <Form.Item
                name="projectContent"
                label={t('create.projectContent')}
                hidden={projectBodyMode === 'preview'}
                rules={[{ required: true, message: t('create.projectContentRequired') }]}
              >
                <Input.TextArea
                  placeholder={t('create.projectContentPlaceholder')}
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
                    {watchedProjectTitle?.trim() ? watchedProjectTitle : t('create.projectNoTitle')}
                  </Title>
                  <Paragraph type="secondary" style={{ fontSize: isPageMobile ? 15 : 16, marginBottom: 12 }}>
                    {watchedProjectSummary?.trim()
                      ? watchedProjectSummary
                      : t('create.projectNoSummary')}
                  </Paragraph>
                  <Divider style={{ margin: '12px 0' }} />
                  {watchedProjectContent?.trim() ? (
                    <ProjectMarkdownContent markdown={watchedProjectContent} />
                  ) : (
                    <Text type="secondary">{t('create.projectNoContent')}</Text>
                  )}
                </div>
              )}
              <Form.Item label={t('create.resources')}>
                <Upload
                  listType="picture"
                  fileList={projectFileList}
                  onChange={({ fileList: fl }) => updateProjectFileList(fl)}
                  onPreview={handleUploadPreview}
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
                    {t('create.uploadResources')}
                  </Button>
                </Upload>
              </Form.Item>
              {isAdmin && (
                <Form.Item
                  name="isrecommended"
                  label={t('create.recommend')}
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
                {editTarget?.kind === 'project' ? t('create.saveProject') : t('create.createProject')}
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
  const uploadPreviewModal = (
    <Modal
      open={!!previewImage}
      title={previewTitle}
      footer={null}
      onCancel={() => setPreviewImage('')}
      destroyOnHidden
    >
      <img alt={previewTitle} style={{ width: '100%' }} src={previewImage} />
    </Modal>
  );

  if (variant === 'modal') {
    return (
      <>
        {tabsWithLoadingOverlay}
        {uploadPreviewModal}
      </>
    );
  }

  if (isPageMobile) {
    return (
      <>
        <div style={{ paddingTop: 0 }}>{tabsWithLoadingOverlay}</div>
        {uploadPreviewModal}
      </>
    );
  }

  const pageTitle = editTarget
    ? editTarget.kind === 'post'
      ? t('create.editPostTitle')
      : t('create.editProjectTitle')
    : t('create.publishTitle');
  const pageDesc = editTarget
    ? t('create.editDesc')
    : t('create.publishDesc');

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
      {uploadPreviewModal}
    </>
  );
};

export default CreatePanel;
