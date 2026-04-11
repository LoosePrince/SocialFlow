import React, { useState } from 'react';
import { Modal, Tabs, Form, Input, Upload, Button, Space, App } from 'antd';
import { ImagePlus, Type, FileText, Send, Projector } from 'lucide-react';
import { uploadToGithub } from '../github';
import { useAuth } from '../context/AuthContext';
import { apiJson } from '../lib/api';

interface CreateModalProps {
  visible: boolean;
  onCancel: () => void;
}

const CreateModal: React.FC<CreateModalProps> = ({ visible, onCancel }) => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [postForm] = Form.useForm();
  const [projectForm] = Form.useForm();
  const [fileList, setFileList] = useState<any[]>([]);
  const { message } = App.useApp();

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
      onCancel();
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
      onCancel();
    } catch (error: any) {
      message.error(`项目创建失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onFinishFailed = () => {
    message.error('请完善表单必填项');
  };

  return (
    <Modal
      title={null}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={600}
      styles={{ body: { padding: '24px' } }}
      centered
    >
      <Tabs defaultActiveKey="post" onChange={() => setFileList([])} items={[
        {
          key: 'post',
          label: <Space><Type size={18}/> 动态</Space>,
          children: (
            <Form 
              form={postForm} 
              onFinish={handleCreatePost} 
              onFinishFailed={onFinishFailed}
              layout="vertical"
            >
              <Form.Item name="content" rules={[{ required: true, message: '请输入动态内容' }]}>
                <Input.TextArea placeholder="分享你现在的心情..." rows={4} variant="borderless" style={{ fontSize: 16 }} />
              </Form.Item>
              <Form.Item label="图片 (最多9张)">
                <Upload
                  listType="picture-card"
                  fileList={fileList}
                  onChange={({ fileList }) => setFileList(fileList)}
                  beforeUpload={() => false}
                  multiple
                  maxCount={9}
                >
                  {fileList.length >= 9 ? null : <div><ImagePlus size={20} /><div style={{ marginTop: 8 }}>上传</div></div>}
                </Upload>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block size="large" icon={<Send size={18}/>}>
                发布动态
              </Button>
            </Form>
          )
        },
        {
          key: 'project',
          label: <Space><FileText size={18}/> 项目</Space>,
          children: (
            <Form 
              form={projectForm} 
              onFinish={handleCreateProject} 
              onFinishFailed={onFinishFailed}
              layout="vertical"
            >
              <Form.Item name="title" label="项目名称" rules={[{ required: true, message: '请填写项目标题' }]}>
                <Input placeholder="输入项目标题" size="large" />
              </Form.Item>
              <Form.Item name="summary" label="简短介绍">
                <Input.TextArea placeholder="简短的项目介绍" rows={2} />
              </Form.Item>
              <Form.Item name="projectContent" label="项目详情 (Markdown)" rules={[{ required: true, message: '请填写项目详情' }]}>
                <Input.TextArea placeholder="支持 Markdown 格式内容" rows={6} />
              </Form.Item>
              <Form.Item label="资源列表 (首张为封面图)">
                <Upload
                  listType="picture"
                  fileList={fileList}
                  onChange={({ fileList }) => setFileList(fileList)}
                  beforeUpload={() => false}
                  multiple
                >
                  <Button icon={<ImagePlus size={16}/>}>点击上传资源</Button>
                </Upload>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block size="large" icon={<Projector size={18}/>}>
                创建项目
              </Button>
            </Form>
          )
        }
      ]} />
    </Modal>
  );
};

export default CreateModal;
