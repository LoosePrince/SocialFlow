import React, { useState } from 'react';
import { App, Button, Form, Input, Typography, Upload } from 'antd';
import { Camera } from 'lucide-react';
import { GithubCdnAvatar } from './GithubCdnAvatar';
import { useI18n } from '../context/I18nContext';
import { apiJson, apiUrl } from '../lib/api';
import { supabase } from '../supabase';
import { sanitizeReturnPath } from '../lib/navigation';
import { useNavigate } from 'react-router-dom';

const { Text, Paragraph } = Typography;

export interface QqRegisterFormProps {
  uin: string;
  ticket: string;
  returnTo?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const QqRegisterForm: React.FC<QqRegisterFormProps> = ({
  uin,
  ticket,
  returnTo = '/',
  onSuccess,
  onCancel,
}) => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form] = Form.useForm<{ displayname: string; photourl: string }>();
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photourl = Form.useWatch('photourl', form);

  const onAvatarUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('ticket', ticket);
      fd.append('file', file);
      const res = await fetch(apiUrl('/api/qq/register/upload'), {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as { path?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || t('qqRegister.avatarUploadFailed'));
      }
      if (!data.path) {
        throw new Error(t('qqRegister.avatarUploadFailed'));
      }
      form.setFieldsValue({ photourl: data.path });
      message.success(t('qqRegister.avatarUploadSuccess'));
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('qqRegister.avatarUploadFailed'));
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleSubmit = async (values: { displayname: string; photourl: string }) => {
    setSubmitting(true);
    try {
      const session = await apiJson<{
        access_token: string;
        refresh_token: string;
      }>('/api/qq/register', {
        method: 'POST',
        body: JSON.stringify({
          ticket,
          displayname: values.displayname.trim(),
          photourl: values.photourl.trim(),
        }),
      });

      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) {
        throw new Error(error.message || t('qq.sessionSetFailed'));
      }

      message.success(t('qqRegister.success'));
      onSuccess();
      navigate(sanitizeReturnPath(returnTo), { replace: true });
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('qqRegister.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {t('qqRegister.desc', { uin })}
      </Paragraph>

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) =>
          void handleSubmit(values as { displayname: string; photourl: string })
        }
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
          <div style={{ position: 'relative' }}>
            <GithubCdnAvatar src={photourl || ''} size={72} />
            <Upload
              showUploadList={false}
              beforeUpload={onAvatarUpload}
              accept="image/*"
              disabled={uploading || submitting}
            >
              <Button
                size="small"
                shape="circle"
                icon={<Camera size={12} />}
                loading={uploading}
                style={{ position: 'absolute', bottom: 0, right: 0 }}
              />
            </Upload>
          </div>
          <Text type="secondary">{t('qqRegister.avatarHint')}</Text>
        </div>

        <Form.Item
          name="displayname"
          label={t('qqRegister.nickname')}
          rules={[
            { required: true, message: t('qqRegister.nicknameRequired') },
            { max: 32, message: t('qqRegister.nicknameMax') },
          ]}
        >
          <Input placeholder={t('qqRegister.nicknamePlaceholder')} size="large" />
        </Form.Item>

        <Form.Item
          name="photourl"
          hidden
          rules={[{ required: true, message: t('qqRegister.avatarRequired') }]}
        >
          <Input />
        </Form.Item>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onCancel} disabled={submitting || uploading} style={{ flex: 1 }}>
            {t('common.cancel')}
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            disabled={uploading}
            style={{ flex: 1 }}
          >
            {t('qqRegister.submit')}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default QqRegisterForm;
