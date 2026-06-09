import React, { useState, useEffect, useRef } from 'react';
import { App, Tabs, Form, Input, Button, Space, Typography, theme, Grid, Switch, Spin, Segmented, Flex, Divider } from 'antd';
import type { InputRef } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { Type, FileText, Send, Projector, Eye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { apiJson } from '../lib/api';
import {
  inferFileKind,
  isPersistedFileAsset,
  legacyFileAssetFromPath,
  mergeFileAssetsByPath,
  type FileAsset,
  uploadFileAsset,
} from '../lib/files';
import { filesFromClipboard, filesFromDataTransfer } from '../lib/fileInput';
import PostBodyDisplay from './PostBodyDisplay';
import ProjectMarkdownContent from './ProjectMarkdownContent';
import SmartFeedImage from './SmartFeedImage';
import OwoEmojiPicker from './OwoEmojiPicker';
import CommentText from './CommentText';
import AttachmentPicker from './AttachmentPicker';
import AttachmentList from './AttachmentList';

const { Title, Paragraph, Text } = Typography;
const { useBreakpoint } = Grid;

type TextInputRef = InputRef | TextAreaRef;

export type CreatePanelVariant = 'modal' | 'page';

export interface CreatePanelProps {
  variant?: CreatePanelVariant;
  /** 发布或保存成功后的回调（弹窗关闭、页面跳转等） */
  onSuccess: () => void;
  /** 编辑已有动态或项目 */
  editTarget?: { kind: 'post' | 'project'; id: string };
}

function persistedAttachmentIds(assets: FileAsset[]): string[] {
  return assets.filter(isPersistedFileAsset).map((asset) => asset.id);
}

function imagePathsFromAttachments(assets: FileAsset[], max = 9): string[] {
  return assets.filter((asset) => asset.kind === 'image').slice(0, max).map((asset) => asset.path);
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
  const postContentRef = useRef<TextAreaRef | null>(null);
  const projectTitleRef = useRef<InputRef | null>(null);
  const projectSummaryRef = useRef<TextAreaRef | null>(null);
  const projectContentRef = useRef<TextAreaRef | null>(null);
  const [postAttachments, setPostAttachments] = useState<FileAsset[]>([]);
  const [projectCover, setProjectCover] = useState<FileAsset[]>([]);
  const [projectAttachments, setProjectAttachments] = useState<FileAsset[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [composerDragTarget, setComposerDragTarget] = useState<'post' | 'project' | null>(null);
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

  const insertIntoFormField = (
    form: typeof postForm,
    fieldName: string,
    textRef: React.RefObject<TextInputRef | null>,
    placeholder: string
  ) => {
    const current = String(form.getFieldValue(fieldName) ?? '');
    const input = 'input' in (textRef.current ?? {}) 
      ? (textRef.current as InputRef).input 
      : (textRef.current as TextAreaRef | null)?.resizableTextArea?.textArea;
    const start = input?.selectionStart ?? current.length;
    const end = input?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${placeholder}${current.slice(end)}`;
    form.setFieldValue(fieldName, next);
    window.setTimeout(() => {
      input?.focus();
      const cursor = start + placeholder.length;
      input?.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const hasFileTransfer = (dataTransfer: DataTransfer | null) =>
    Array.from(dataTransfer?.items ?? []).some((item) => item.kind === 'file') ||
    Array.from(dataTransfer?.types ?? []).includes('Files');

  const trimPostImageLimit = (assets: FileAsset[]) => {
    let imageSeen = 0;
    return assets.filter((asset) => {
      if (asset.kind !== 'image') return true;
      imageSeen += 1;
      return imageSeen <= 9;
    });
  };

  const uploadComposerFiles = async (target: 'post' | 'project', files: File[]) => {
    if (files.length === 0) return;
    const current = target === 'post' ? postAttachments : projectAttachments;
    const remainingPostImages = 9 - current.filter((asset) => asset.kind === 'image').length;
    let remainingImages = target === 'post' ? Math.max(0, remainingPostImages) : Number.POSITIVE_INFINITY;
    let skippedImages = 0;
    const candidates: File[] = [];

    for (const file of files) {
      if (target === 'post' && inferFileKind(file.name, file.type) === 'image') {
        if (remainingImages <= 0) {
          skippedImages += 1;
          continue;
        }
        remainingImages -= 1;
      }
      candidates.push(file);
    }

    if (skippedImages > 0) {
      message.warning(t('files.skippedImageLimit', { count: 9 }));
    }
    if (candidates.length === 0) {
      message.info(t('files.noUploadable'));
      return;
    }

    setAttachmentUploading(true);
    const uploaded: FileAsset[] = [];
    const failed: string[] = [];
    try {
      for (const file of candidates) {
        try {
          uploaded.push(await uploadFileAsset(file));
        } catch (error) {
          failed.push(error instanceof Error ? error.message : t('files.uploadFileFailed', { name: file.name }));
        }
      }

      if (uploaded.length > 0) {
        if (target === 'post') {
          setPostAttachments((prev) => trimPostImageLimit(mergeFileAssetsByPath([...prev, ...uploaded])));
        } else {
          setProjectAttachments((prev) => mergeFileAssetsByPath([...prev, ...uploaded]));
        }
      }

      if (uploaded.length > 0 && failed.length === 0) {
        message.success(uploaded.length === 1 ? t('files.attachmentUploadedOne') : t('files.attachmentUploadedMany', { count: uploaded.length }));
      } else if (uploaded.length > 0) {
        message.warning(t('files.uploadedPartial', { success: uploaded.length, failed: failed.length }));
      } else {
        message.error(failed[0] || t('files.uploadFailed'));
      }
    } finally {
      setAttachmentUploading(false);
    }
  };

  const handleComposerPaste = (event: React.ClipboardEvent, target: 'post' | 'project') => {
    const files = filesFromClipboard(event.clipboardData, 'attachment');
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    void uploadComposerFiles(target, files);
  };

  const handleComposerDrop = (event: React.DragEvent, target: 'post' | 'project') => {
    const files = filesFromDataTransfer(event.dataTransfer, 'attachment');
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setComposerDragTarget(null);
    void uploadComposerFiles(target, files);
  };

  const handleComposerDragEnter = (event: React.DragEvent, target: 'post' | 'project') => {
    if (!hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    setComposerDragTarget(target);
  };

  const handleComposerDragOver = (event: React.DragEvent, target: 'post' | 'project') => {
    if (!hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    setComposerDragTarget(target);
  };

  const handleComposerDragLeave = (event: React.DragEvent) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setComposerDragTarget(null);
  };

  const composerFileDropStyle = (target: 'post' | 'project'): React.CSSProperties => ({
    borderRadius: token.borderRadiusLG,
    outline: composerDragTarget === target ? `2px dashed ${token.colorPrimary}` : 'none',
    outlineOffset: 6,
    background: composerDragTarget === target ? token.colorPrimaryBg : undefined,
    transition: 'background .2s, outline-color .2s',
  });

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
            fileattachments?: FileAsset[];
            isrecommended?: boolean;
          }>(`/api/posts/${editTarget.id}`);
          if (cancelled) return;
          const imgs = Array.isArray(data.images) ? (data.images as string[]) : [];
          const newAttachments = Array.isArray(data.fileattachments) ? data.fileattachments : [];
          postForm.setFieldsValue({
            content: data.content,
            ...(isAdmin ? { isrecommended: !!data.isrecommended } : {}),
          });
          setPostAttachments(
            mergeFileAssetsByPath([
              ...newAttachments,
              ...imgs.map((path) => legacyFileAssetFromPath(path, 'image')),
            ])
          );
        } else {
          const data = await apiJson<{
            title: string;
            summary?: string;
            content: string;
            coverurl?: string;
            attachments?: unknown;
            fileattachments?: FileAsset[];
            isrecommended?: boolean;
          }>(`/api/projects/${editTarget.id}`);
          if (cancelled) return;
          const atts = Array.isArray(data.attachments) ? (data.attachments as string[]) : [];
          const newAttachments = Array.isArray(data.fileattachments) ? data.fileattachments : [];
          projectForm.setFieldsValue({
            title: data.title,
            summary: data.summary ?? '',
            projectContent: data.content,
            ...(isAdmin ? { isrecommended: !!data.isrecommended } : {}),
          });
          setProjectCover(data.coverurl ? [legacyFileAssetFromPath(data.coverurl, 'image')] : []);
          setProjectAttachments(
            mergeFileAssetsByPath([
              ...newAttachments,
              ...atts.map((path) => legacyFileAssetFromPath(path)),
            ])
          );
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
      const images = imagePathsFromAttachments(postAttachments);
      const attachmentIds = persistedAttachmentIds(postAttachments);

      if (editTarget?.kind === 'post') {
        await apiJson(`/api/posts/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            content: values.content,
            images,
            attachmentIds,
            ...(isAdmin ? { isrecommended: !!values.isrecommended } : {}),
          }),
        });
        message.success(t('create.postUpdated'));
      } else {
        await apiJson('/api/posts', {
          method: 'POST',
          body: JSON.stringify({
            id: postDraftId,
            content: values.content,
            images,
            attachmentIds,
            isrecommended: isAdmin ? !!values.isrecommended : false,
          }),
        });
        message.success(t('create.postCreated'));
        setPostDraftId(crypto.randomUUID());
      }

      postForm.resetFields();
      setPostAttachments([]);
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
      const coverurl = projectCover[0]?.path ?? '';
      const attachments = projectAttachments
        .filter((asset) => !isPersistedFileAsset(asset))
        .map((asset) => asset.path);
      const attachmentIds = persistedAttachmentIds(projectAttachments);

      if (editTarget?.kind === 'project') {
        await apiJson(`/api/projects/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: values.title,
            summary: values.summary ?? '',
            content: values.projectContent,
            coverurl,
            attachments,
            attachmentIds,
            ...(isAdmin ? { isrecommended: !!values.isrecommended } : {}),
          }),
        });
        message.success(t('create.projectUpdated'));
      } else {
        await apiJson('/api/projects', {
          method: 'POST',
          body: JSON.stringify({
            id: projectDraftId,
            title: values.title,
            summary: values.summary,
            content: values.projectContent,
            coverurl,
            attachments,
            attachmentIds,
            isrecommended: isAdmin ? !!values.isrecommended : false,
          }),
        });
        message.success(t('create.projectCreated'));
        setProjectDraftId(crypto.randomUUID());
      }

      projectForm.resetFields();
      setProjectCover([]);
      setProjectAttachments([]);
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
        if (k === 'post') {
          setProjectCover([]);
          setProjectAttachments([]);
        } else {
          setPostAttachments([]);
        }
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
              onPaste={(event) => handleComposerPaste(event, 'post')}
              onDrop={(event) => handleComposerDrop(event, 'post')}
              onDragEnter={(event) => handleComposerDragEnter(event, 'post')}
              onDragOver={(event) => handleComposerDragOver(event, 'post')}
              onDragLeave={handleComposerDragLeave}
              style={composerFileDropStyle('post')}
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
              <Form.Item hidden={postBodyMode === 'preview'}>
                <Flex align="start" gap={8}>
                  <Form.Item
                    name="content"
                    noStyle
                    rules={[{ required: true, message: t('create.postContentRequired') }]}
                  >
                    <Input.TextArea
                      ref={postContentRef}
                      placeholder={t('create.postPlaceholder')}
                      rows={isPageMobile ? 6 : variant === 'page' ? 5 : 4}
                      variant={isPageMobile ? 'outlined' : 'borderless'}
                      style={{
                        ...inputFont,
                        minHeight: isPageMobile ? 140 : undefined,
                        resize: 'vertical' as const,
                        flex: 1,
                      }}
                    />
                  </Form.Item>
                  <OwoEmojiPicker
                    buttonSize={isPageMobile ? 'large' : 'middle'}
                    onInsert={(ph) => insertIntoFormField(postForm, 'content', postContentRef, ph)}
                  />
                </Flex>
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
                  {imagePathsFromAttachments(postAttachments).length > 0 && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 4,
                        marginTop: 12,
                        maxWidth: 400,
                      }}
                    >
                      {imagePathsFromAttachments(postAttachments).map((src, index) => {
                        return (
                          <div
                            key={src || index}
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
                  <AttachmentList
                    compact
                    attachments={postAttachments.filter((asset) => asset.kind !== 'image')}
                  />
                </div>
              )}
              <Form.Item label={t('create.postAttachments')}>
                <AttachmentPicker
                  value={postAttachments}
                  onChange={setPostAttachments}
                  maxImages={9}
                  label={t('create.postAttachmentsHint')}
                />
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
                loading={loading || attachmentUploading}
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
              onPaste={(event) => handleComposerPaste(event, 'project')}
              onDrop={(event) => handleComposerDrop(event, 'project')}
              onDragEnter={(event) => handleComposerDragEnter(event, 'project')}
              onDragOver={(event) => handleComposerDragOver(event, 'project')}
              onDragLeave={handleComposerDragLeave}
              style={composerFileDropStyle('project')}
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
                label={t('create.projectTitle')}
                hidden={projectBodyMode === 'preview'}
              >
                <Flex align="center" gap={8}>
                  <Form.Item
                    name="title"
                    noStyle
                    rules={[{ required: true, message: t('create.projectTitleRequired') }]}
                  >
                    <Input
                      ref={projectTitleRef}
                      placeholder={t('create.projectTitlePlaceholder')}
                      size="large"
                      style={{ ...inputFont, flex: 1 }}
                    />
                  </Form.Item>
                  <OwoEmojiPicker
                    buttonSize={isPageMobile ? 'large' : 'middle'}
                    onInsert={(ph) => insertIntoFormField(projectForm, 'title', projectTitleRef, ph)}
                  />
                </Flex>
              </Form.Item>
              <Form.Item label={t('create.projectSummary')} hidden={projectBodyMode === 'preview'}>
                <Flex align="start" gap={8}>
                  <Form.Item name="summary" noStyle>
                    <Input.TextArea
                      ref={projectSummaryRef}
                      placeholder={t('create.projectSummaryPlaceholder')}
                      rows={isPageMobile ? 3 : 2}
                      style={{ ...inputFont, flex: 1 }}
                    />
                  </Form.Item>
                  <OwoEmojiPicker
                    buttonSize={isPageMobile ? 'large' : 'middle'}
                    onInsert={(ph) => insertIntoFormField(projectForm, 'summary', projectSummaryRef, ph)}
                  />
                </Flex>
              </Form.Item>
              <Form.Item
                label={t('create.projectContent')}
                hidden={projectBodyMode === 'preview'}
              >
                <Flex align="start" gap={8}>
                  <Form.Item
                    name="projectContent"
                    noStyle
                    rules={[{ required: true, message: t('create.projectContentRequired') }]}
                  >
                    <Input.TextArea
                      ref={projectContentRef}
                      placeholder={t('create.projectContentPlaceholder')}
                      rows={isPageMobile ? 8 : 6}
                      style={{ ...inputFont, minHeight: isPageMobile ? 160 : undefined, flex: 1 }}
                    />
                  </Form.Item>
                  <OwoEmojiPicker
                    buttonSize={isPageMobile ? 'large' : 'middle'}
                    onInsert={(ph) => insertIntoFormField(projectForm, 'projectContent', projectContentRef, ph)}
                  />
                </Flex>
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
                    {watchedProjectTitle?.trim() ? (
                      <CommentText text={watchedProjectTitle} />
                    ) : (
                      t('create.projectNoTitle')
                    )}
                  </Title>
                  <Paragraph type="secondary" style={{ fontSize: isPageMobile ? 15 : 16, marginBottom: 12 }}>
                    {watchedProjectSummary?.trim()
                      ? <CommentText text={watchedProjectSummary} />
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
              <Form.Item label={t('create.projectCover')}>
                <AttachmentPicker
                  value={projectCover}
                  onChange={setProjectCover}
                  label={t('create.projectCoverHint')}
                  accept="image/*"
                  kindFilter="image"
                  single
                />
              </Form.Item>
              <Form.Item label={t('create.projectAttachments')}>
                <AttachmentPicker
                  value={projectAttachments}
                  onChange={setProjectAttachments}
                  label={t('create.projectAttachmentsHint')}
                />
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
                loading={loading || attachmentUploading}
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
  if (variant === 'modal') {
    return <>{tabsWithLoadingOverlay}</>;
  }

  if (isPageMobile) {
    return <div style={{ paddingTop: 0 }}>{tabsWithLoadingOverlay}</div>;
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
    </>
  );
};

export default CreatePanel;
