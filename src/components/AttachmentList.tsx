import { Button, Flex, Tag, Typography, theme } from 'antd';
import { Archive, Download, File, FileAudio, FileImage, FileText, FileVideo } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { fileAssetUrl, formatFileSize, type FileAsset, type FileKind } from '../lib/files';
import FilePreviewModal from './FilePreviewModal';
import { useI18n } from '../context/I18nContext';

const { Text } = Typography;

type Props = {
  attachments?: FileAsset[];
  compact?: boolean;
};

const iconMap: Record<FileKind, React.ReactNode> = {
  image: <FileImage size={18} />,
  audio: <FileAudio size={18} />,
  video: <FileVideo size={18} />,
  document: <FileText size={18} />,
  archive: <Archive size={18} />,
  file: <File size={18} />,
};

const AttachmentList: React.FC<Props> = ({ attachments = [], compact = false }) => {
  const { token } = theme.useToken();
  const { t } = useI18n();
  const [preview, setPreview] = useState<FileAsset | null>(null);
  const items = useMemo(() => attachments.filter(Boolean), [attachments]);
  if (items.length === 0) return null;

  return (
    <>
      <Flex vertical gap={compact ? 6 : 8} style={{ marginTop: compact ? 10 : 16 }}>
        {items.map((asset) => {
          const url = fileAssetUrl(asset);
          return (
            <Flex
              key={asset.id}
              align="center"
              gap={10}
              style={{
                padding: compact ? '8px 10px' : '10px 12px',
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
                background: token.colorBgContainer,
                minWidth: 0,
              }}
            >
              <span style={{ color: token.colorTextSecondary, display: 'flex' }}>{iconMap[asset.kind] ?? iconMap.file}</span>
              <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                <Text ellipsis strong={!compact} style={{ fontSize: compact ? 13 : 14 }}>
                  {asset.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatFileSize(asset.size)}
                </Text>
              </Flex>
              <Tag style={{ marginInlineEnd: 0 }}>{asset.kind}</Tag>
              <Button size="small" type="text" onClick={() => setPreview(asset)}>
                {t('files.open')}
              </Button>
              {!compact && (
                <Button size="small" type="text" icon={<Download size={15} />} href={url} download={asset.name} />
              )}
            </Flex>
          );
        })}
      </Flex>
      <FilePreviewModal asset={preview} open={!!preview} onClose={() => setPreview(null)} />
    </>
  );
};

export default AttachmentList;
