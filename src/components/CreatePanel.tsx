import React, { useState } from 'react';
import { App, Tabs, Form, Input, Upload, Button, Space, Typography, theme, Grid } from 'antd';
import { ImagePlus, Type, FileText, Send, Projector } from 'lucide-react';
import { uploadToGithub } from '../github';
import { useAuth } from '../context/AuthContext';
import { apiJson } from '../lib/api';

const { Title, Paragraph } = Typography;
const { useBreakpoint } = Grid;

export type CreatePanelVariant = 'modal' | 'page';

export interface CreatePanelProps {
  variant?: CreatePanelVariant;
  /** 发布成功后的回调（弹窗关闭、页面跳转等） */
  onSuccess: () => void;
}

const CreatePanel: React.FC<CreatePanelProps> = ({ variant = 'modal', onSuccess }) => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [postForm] = Form.useForm();
  const [projectForm] = Form.useForm();
  const [fileList, setFileList] = useState<any[]>([]);
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const isPageMobile = variant === 'page' && !screens.md;

  const handleCreatePost = async (values: any) => {
    if (!user) return;
    setLoading(true);
    try {
      const filePaths = await Promise.all(
        fileList.map((file) => uploadToGithub(file.originFileObj))
      );

      await apiJson('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          content: values.content,
          images: filePaths,
          isrecommended: !!isAdmin,
        }),
      });

      message.success('动态发布成功');
      postForm.resetFields();
      setFileList([]);
      onSuccess();
    } catch (error: any) {
      message.error(`动态发布失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (values: any) => {
    if (!user) return;
    setLoading(true);
    try {
      const filePaths = await Promise.all(
        fileList.map((file) => uploadToGithub(file.originFileObj))
      );

      await apiJson('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: values.title,
          summary: values.summary,
          content: values.projectContent,
          coverurl: filePaths[0] || '',
          attachments: filePaths.slice(1),
          isrecommended: !!isAdmin,
        }),
      });

      message.success('项目创建成功');
      projectForm.resetFields();
      setFileList([]);
      onSuccess();
    } catch (error: any) {
      message.error(`项目创建失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onFinishFailed = () => {
    message.error('请完善表单必填项');
  };

  const touchBtnStyle = isPageMobile ? { minHeight: 48, fontSize: 16 } : undefined;
  const inputFont = { fontSize: 16, lineHeight: 1.55 as const };

  const tabs = (
    <Tabs
      defaultActiveKey="post"
      onChange={() => setFileList([])}
      className={isPageMobile ? 'create-page-tabs' : undefined}
      tabBarStyle={isPageMobile ? { marginBottom: 12, paddingLeft: 0, paddingRight: 0 } : undefined}
      items={[
        {
          key: 'post',
          label: (
            <Space size={isPageMobile ? 4 : 8}>
              <Type size={isPageMobile ? 17 : 18} /> 动态
            </Space>
          ),
          children: (
            <Form
              form={postForm}
              onFinish={handleCreatePost}
              onFinishFailed={onFinishFailed}
              layout="vertical"
              requiredMark={false}
            >
              <Form.Item name="content" rules={[{ required: true, message: '请输入动态内容' }]}>
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
              <Form.Item label={isPageMobile ? '图片（最多 9 张）' : '图片 (最多9张)'}>
                <div className={isPageMobile ? 'create-page-upload-scroll' : undefined}>
                  <Upload
                    listType="picture-card"
                    fileList={fileList}
                    onChange={({ fileList: fl }) => setFileList(fl)}
                    beforeUpload={() => false}
                    multiple
                    maxCount={9}
                  >
                    {fileList.length >= 9 ? null : (
                      <div style={{ padding: isPageMobile ? 4 : undefined }}>
                        <ImagePlus size={isPageMobile ? 22 : 20} />
                        <div style={{ marginTop: 6, fontSize: isPageMobile ? 12 : undefined }}>上传</div>
                      </div>
                    )}
                  </Upload>
                </div>
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
                icon={<Send size={18} />}
                style={touchBtnStyle}
              >
                发布动态
              </Button>
            </Form>
          ),
        },
        {
          key: 'project',
          label: (
            <Space size={isPageMobile ? 4 : 8}>
              <FileText size={isPageMobile ? 17 : 18} /> 项目
            </Space>
          ),
          children: (
            <Form
              form={projectForm}
              onFinish={handleCreateProject}
              onFinishFailed={onFinishFailed}
              layout="vertical"
              requiredMark={false}
            >
              <Form.Item name="title" label="项目名称" rules={[{ required: true, message: '请填写项目标题' }]}>
                <Input placeholder="输入项目标题" size="large" style={inputFont} />
              </Form.Item>
              <Form.Item name="summary" label="简短介绍">
                <Input.TextArea placeholder="简短的项目介绍" rows={isPageMobile ? 3 : 2} style={inputFont} />
              </Form.Item>
              <Form.Item
                name="projectContent"
                label="项目详情 (Markdown)"
                rules={[{ required: true, message: '请填写项目详情' }]}
              >
                <Input.TextArea
                  placeholder="支持 Markdown 格式内容"
                  rows={isPageMobile ? 8 : 6}
                  style={{ ...inputFont, minHeight: isPageMobile ? 160 : undefined }}
                />
              </Form.Item>
              <Form.Item label="资源列表（首张为封面图）">
                <Upload
                  listType="picture"
                  fileList={fileList}
                  onChange={({ fileList: fl }) => setFileList(fl)}
                  beforeUpload={() => false}
                  multiple
                  className={isPageMobile ? 'create-page-project-upload' : undefined}
                >
                  <Button icon={<ImagePlus size={16} />} block={isPageMobile} size="large" style={isPageMobile ? { height: 44 } : undefined}>
                    上传资源
                  </Button>
                </Upload>
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
                icon={<Projector size={18} />}
                style={touchBtnStyle}
              >
                创建项目
              </Button>
            </Form>
          ),
        },
      ]}
    />
  );

  if (variant === 'modal') {
    return tabs;
  }

  if (isPageMobile) {
    return <div style={{ paddingTop: 0 }}>{tabs}</div>;
  }

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ marginBottom: 8 }}>
          发布内容
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          分享动态或创建项目
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
        {tabs}
      </div>
    </>
  );
};

export default CreatePanel;
