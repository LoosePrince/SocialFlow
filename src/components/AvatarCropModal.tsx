import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Modal, Slider, Space } from 'antd';
import EasyCrop, { type Area, type Point } from 'react-easy-crop';
import { useI18n } from '../context/I18nContext';
import { cropImageToBlob } from '../lib/cropImage';

type CropperComponent = React.ComponentType<{
  image?: string;
  crop: Point;
  zoom: number;
  aspect: number;
  cropShape?: 'rect' | 'round';
  showGrid?: boolean;
  onCropChange: (location: Point) => void;
  onZoomChange?: (zoom: number) => void;
  onCropComplete?: (croppedArea: Area, croppedAreaPixels: Area) => void;
}>;

const Cropper = EasyCrop as unknown as CropperComponent;

export interface AvatarCropModalProps {
  open: boolean;
  file: File | null;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

const AvatarCropModal: React.FC<AvatarCropModalProps> = ({ open, file, onConfirm, onCancel }) => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open || !file) {
      setImageUrl(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [open, file]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageUrl || !croppedAreaPixels || !file) {
      message.error(t('avatarCrop.areaRequired'));
      return;
    }

    setProcessing(true);
    try {
      const blob = await cropImageToBlob(imageUrl, croppedAreaPixels);
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar';
      const cropped = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
      onConfirm(cropped);
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('avatarCrop.failed'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      title={t('avatarCrop.title')}
      open={open}
      onCancel={onCancel}
      destroyOnHidden
      width={420}
      footer={
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onCancel} disabled={processing}>
            {t('common.cancel')}
          </Button>
          <Button type="primary" loading={processing} onClick={() => void handleConfirm()}>
            {t('avatarCrop.confirm')}
          </Button>
        </Space>
      }
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 320,
          background: '#111',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {imageUrl ? (
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        ) : null}
      </div>

      <div style={{ marginTop: 16 }}>
        <span style={{ fontSize: 13, opacity: 0.65 }}>{t('avatarCrop.zoom')}</span>
        <Slider min={1} max={3} step={0.01} value={zoom} onChange={setZoom} disabled={!imageUrl} />
      </div>
    </Modal>
  );
};

export default AvatarCropModal;
