import React, { useEffect, useRef, useState } from 'react';
import { App, Avatar, Button, Form, Input, Typography } from 'antd';
import { Camera } from 'lucide-react';
import AvatarCropModal from './AvatarCropModal';
import { useI18n } from '../context/I18nContext';
import { apiFetch, parseApiResponse } from '../lib/api';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form] = Form.useForm<{ displayname: string }>();
  const [submitting, setSubmitting] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [avatarFile]);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      message.error(t('qqRegister.avatarImageOnly'));
      return;
    }
    setPendingFile(file);
    setCropOpen(true);
  };

  const handleCropConfirm = (file: File) => {
    setAvatarFile(file);
    setCropOpen(false);
    setPendingFile(null);
  };

  const handleCropCancel = () => {
    setCropOpen(false);
    setPendingFile(null);
  };

  const handleSubmit = async (values: { displayname: string }) => {
    if (!avatarFile) {
      message.error(t('qqRegister.avatarRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('ticket', ticket);
      fd.append('displayname', values.displayname.trim());
      fd.append('file', avatarFile);

      const res = await apiFetch('/api/qq/register', {
        method: 'POST',
        body: fd,
      });
      const data = await parseApiResponse<{
        access_token?: string;
        refresh_token?: string;
      }>(res);

      if (!data.access_token || !data.refresh_token) {
        throw new Error(t('qq.tokenInvalid'));
      }

      const { error } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFileInputChange}
      />

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <Avatar src={avatarPreviewUrl || undefined} size={72}>
            {!avatarPreviewUrl ? '?' : null}
          </Avatar>
          <Button
            htmlType="button"
            size="small"
            shape="circle"
            icon={<Camera size={12} />}
            disabled={submitting}
            onClick={openFilePicker}
            style={{ position: 'absolute', bottom: 0, right: 0 }}
          />
        </div>
        <Text type="secondary">{t('qqRegister.avatarHint')}</Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => void handleSubmit(values as { displayname: string })}
      >
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

        <div style={{ display: 'flex', gap: 8 }}>
          <Button htmlType="button" onClick={onCancel} disabled={submitting} style={{ flex: 1 }}>
            {t('common.cancel')}
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting} style={{ flex: 1 }}>
            {t('qqRegister.submit')}
          </Button>
        </div>
      </Form>

      <AvatarCropModal
        open={cropOpen}
        file={pendingFile}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />
    </div>
  );
};

export default QqRegisterForm;
