import React, { useState, useEffect } from 'react';
import { Typography, Card, Switch, List, Button, Input, Form, Divider, App, Upload } from 'antd';
import { GithubCdnAvatar } from '../components/GithubCdnAvatar';
import { User, Bell, Shield, Moon, Save, LogOut, Camera } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';
import { uploadToGithub } from '../github';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  const { user, profile, logout } = useAuth();
  const { mode, toggleTheme } = useTheme();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    if (profile) {
      form.setFieldsValue({
        displayname: profile.displayname,
        photourl: profile.photourl,
      });
    }
  }, [profile, form]);

  const handleUpdateProfile = async (values: any) => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          displayname: values.displayname,
          photourl: values.photourl,
        })
        .eq('id', user.id);
      
      if (error) throw error;
      message.success('个人资料已更新');
    } catch (error: any) {
      message.error(`更新失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onAvatarUpload = async (file: File) => {
    try {
      setLoading(true);
      const relativePath = await uploadToGithub(file);
      form.setFieldsValue({ photourl: relativePath });
      message.success('头像已上传，请点击保存修改');
    } catch (e: any) {
      message.error('头像上传失败');
    } finally {
      setLoading(false);
    }
    return false; // Prevent auto upload
  };

  return (
    <motion.div 
      className="main-container"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ paddingBottom: 100 }}
    >
      <Title level={2}>设置</Title>
      
      <Title level={4} style={{ marginTop: 32 }}>个人资料</Title>
      <Card className="card" style={{ marginTop: 12 }}>
        <Form form={form} layout="vertical" onFinish={handleUpdateProfile}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative' }}>
              <GithubCdnAvatar src={profile?.photourl || ''} size={80} />
              <Upload 
                showUploadList={false} 
                beforeUpload={onAvatarUpload} 
                accept="image/*"
              >
                <Button 
                  size="small" 
                  shape="circle" 
                  icon={<Camera size={12}/>} 
                  style={{ position: 'absolute', bottom: 0, right: 0 }} 
                />
              </Upload>
            </div>
            <div style={{ flex: 1 }}>
              <Text type="secondary">用户 ID: {user?.id}</Text>
              <br />
              <Text type="secondary">注册邮箱: {user?.email}</Text>
            </div>
          </div>
          
          <Form.Item name="displayname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
            <Input placeholder="你的公开昵称" size="large" />
          </Form.Item>
          
          <Form.Item name="photourl" label="头像路径 (GitHub 相对路径或外部 URL)">
            <Input placeholder="SocialFlow/avatar.jpg 或 https://..." size="large" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} icon={<Save size={18} />} block size="large">
            保存修改
          </Button>
        </Form>
      </Card>
      
      <Title level={4} style={{ marginTop: 32 }}>应用偏好</Title>
      <Card className="card" style={{ marginTop: 12 }}>
        <List itemLayout="horizontal">
          <List.Item actions={[<Switch checked={mode === 'dark'} onChange={toggleTheme} />]}>
            <List.Item.Meta avatar={<Moon size={20}/>} title="深色模式" />
          </List.Item>
        </List>
      </Card>

      <Divider style={{ margin: '40px 0' }} />
      
      <Button danger type="dashed" icon={<LogOut size={18} />} block size="large" onClick={logout}>
        退出登录
      </Button>
    </motion.div>
  );
};

export default Settings;
