import { App, Button, Empty, Flex, Input, Modal, Select, Space, Table, Tag, Upload, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, File, FileAudio, FileImage, FileText, FileVideo, FolderOpen, Plus, Search, UploadCloud, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { formatFileSize, inferFileKind, listFiles, uploadFileAsset, type FileAsset, type FileKind } from '../lib/files';
import { filesFromClipboard, filesFromDataTransfer, uploadFilesFromAnt } from '../lib/fileInput';
import FilePreviewModal from './FilePreviewModal';
import { useI18n } from '../context/I18nContext';

const { Text } = Typography;

type Props = {
  value: FileAsset[];
  onChange: (next: FileAsset[]) => void;
  maxImages?: number;
  label?: string;
  accept?: string;
  kindFilter?: FileKind | 'all';
  single?: boolean;
};

const iconMap: Record<FileKind, React.ReactNode> = {
  image: <FileImage size={18} />,
  audio: <FileAudio size={18} />,
  video: <FileVideo size={18} />,
  document: <FileText size={18} />,
  archive: <Archive size={18} />,
  file: <File size={18} />,
};

const AttachmentPicker: React.FC<Props> = ({
  value,
  onChange,
  maxImages,
  label,
  accept,
  kindFilter = 'all',
  single = false,
}) => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { t } = useI18n();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [files, setFiles] = useState<FileAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState(kindFilter);
  const [preview, setPreview] = useState<FileAsset | null>(null);

  const selectedIds = useMemo(() => new Set(value.map((item) => item.id)), [value]);
  const imageCount = value.filter((item) => item.kind === 'image').length;
  const displayLabel = label ?? t('files.attachments');
  const kindOptions = useMemo(
    () => [
      { label: t('files.kindAll'), value: 'all' },
      { label: t('files.kindImage'), value: 'image' },
      { label: t('files.kindAudio'), value: 'audio' },
      { label: t('files.kindVideo'), value: 'video' },
      { label: t('files.kindDocument'), value: 'document' },
      { label: t('files.kindArchive'), value: 'archive' },
      { label: t('files.kindFile'), value: 'file' },
    ],
    [t]
  );

  useEffect(() => {
    setKind(kindFilter);
  }, [kindFilter]);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      setFiles(await listFiles({ q: query, kind, limit: 100 }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('files.libraryLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (libraryOpen) void loadLibrary();
  }, [libraryOpen, kind]);

  const addAssets = (assets: FileAsset[]) => {
    const next = single ? [] : [...value];
    for (const asset of assets) {
      if (kindFilter !== 'all' && asset.kind !== kindFilter) {
        message.warning(kindFilter === 'image' ? t('files.chooseImageOnly') : t('files.kindMismatch'));
        continue;
      }
      if (!single && next.some((item) => item.id === asset.id)) continue;
      if (asset.kind === 'image' && maxImages && next.filter((item) => item.kind === 'image').length >= maxImages) {
        message.warning(t('files.imageLimit', { count: maxImages }));
        continue;
      }
      next.push(asset);
      if (single) break;
    }
    onChange(next);
  };

  const removeAsset = (id: string) => {
    onChange(value.filter((item) => item.id !== id));
  };

  const filterUploadFiles = (filesToUpload: File[]) => {
    const source = single ? filesToUpload.slice(0, 1) : filesToUpload;
    const next: File[] = [];
    let skippedByKind = 0;
    let skippedByLimit = 0;
    let remainingImages = maxImages ? Math.max(0, maxImages - imageCount) : Number.POSITIVE_INFINITY;

    for (const file of source) {
      const inferredKind = inferFileKind(file.name, file.type);
      if (kindFilter !== 'all' && inferredKind !== kindFilter) {
        skippedByKind += 1;
        continue;
      }
      if (inferredKind === 'image' && maxImages) {
        if (remainingImages <= 0) {
          skippedByLimit += 1;
          continue;
        }
        remainingImages -= 1;
      }
      next.push(file);
    }

    if (skippedByKind > 0) {
      message.warning(
        kindFilter === 'image'
          ? t('files.skippedNonImages')
          : t('files.skippedKindMismatch', { count: skippedByKind })
      );
    }
    if (skippedByLimit > 0 && maxImages) {
      message.warning(t('files.skippedImageLimit', { count: maxImages }));
    }
    return next;
  };

  const uploadFiles = async (filesToUpload: File[]) => {
    const candidates = filterUploadFiles(filesToUpload);
    if (candidates.length === 0) {
      message.info(t('files.noUploadable'));
      return;
    }
    setUploading(true);
    const uploaded: FileAsset[] = [];
    const failed: string[] = [];
    try {
      for (const file of candidates) {
        try {
          uploaded.push(await uploadFileAsset(file));
          if (single) break;
        } catch (error) {
          failed.push(error instanceof Error ? error.message : t('files.uploadFileFailed', { name: file.name }));
        }
      }
      if (uploaded.length > 0) {
        addAssets(uploaded);
        if (libraryOpen) void loadLibrary();
      }
      if (uploaded.length > 0 && failed.length === 0) {
        message.success(uploaded.length === 1 ? t('files.attachmentUploadedOne') : t('files.attachmentUploadedMany', { count: uploaded.length }));
      } else if (uploaded.length > 0) {
        message.warning(t('files.uploadedPartial', { success: uploaded.length, failed: failed.length }));
      } else {
        message.error(failed[0] || t('files.uploadFailed'));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const dropped = filesFromDataTransfer(event.dataTransfer, 'attachment');
    if (dropped.length > 0) void uploadFiles(dropped);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = filesFromClipboard(event.clipboardData, 'attachment');
    if (pasted.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    void uploadFiles(pasted);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDragActive(false);
  };

  const dropZoneStyle: React.CSSProperties = {
    border: `1px dashed ${dragActive ? token.colorPrimary : token.colorBorder}`,
    background: dragActive ? token.colorPrimaryBg : token.colorFillAlter,
    borderRadius: token.borderRadius,
    padding: value.length === 0 ? 16 : 10,
    cursor: 'copy',
    outline: 'none',
    transition: 'border-color .2s, background .2s',
  };

  const columns: ColumnsType<FileAsset> = [
    {
      title: t('files.name'),
      dataIndex: 'name',
      render: (_, record) => (
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          {iconMap[record.kind] ?? iconMap.file}
          <Text ellipsis style={{ maxWidth: 260 }}>{record.name}</Text>
        </Flex>
      ),
    },
    {
      title: t('files.kind'),
      dataIndex: 'kind',
      width: 90,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: t('files.size'),
      dataIndex: 'size',
      width: 100,
      render: (v) => formatFileSize(v),
    },
    {
      title: t('files.actions'),
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => setPreview(record)}>{t('files.preview')}</Button>
          <Button size="small" type="primary" disabled={selectedIds.has(record.id)} onClick={() => addAssets([record])}>
            {t('files.select')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={10}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={8}>
        <Text type="secondary">
          {displayLabel}{maxImages ? ` · ${t('files.imageCount', { current: imageCount, max: maxImages })}` : ''}
        </Text>
        <Space wrap>
          <Upload
            showUploadList={false}
            accept={accept}
            beforeUpload={(file, list) => {
              const rawList = uploadFilesFromAnt(file as unknown as File, list, 'attachment');
              if (file.uid === list[0]?.uid) void uploadFiles(rawList);
              return false;
            }}
            multiple={!single}
          >
            <Button icon={<UploadCloud size={15} />} loading={uploading}>
              {t('common.upload')}
            </Button>
          </Upload>
          <Button icon={<FolderOpen size={15} />} onClick={() => setLibraryOpen(true)}>
            {t('files.chooseFromLibrary')}
          </Button>
        </Space>
      </Flex>

      <div
        role="button"
        tabIndex={0}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        style={dropZoneStyle}
      >
        {value.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={single ? t('files.dropSingleHint') : t('files.dropAttachmentHint')}
          />
        ) : (
          <Flex vertical gap={8}>
            {value.map((asset) => (
              <Flex key={asset.id} align="center" gap={8} style={{ minWidth: 0 }}>
                {iconMap[asset.kind] ?? iconMap.file}
                <Text ellipsis style={{ flex: 1 }}>{asset.name}</Text>
                <Tag>{asset.kind}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>{formatFileSize(asset.size)}</Text>
                <Button size="small" type="text" onClick={() => setPreview(asset)}>{t('files.open')}</Button>
                <Button size="small" type="text" icon={<X size={14} />} onClick={() => removeAsset(asset.id)} />
              </Flex>
            ))}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('files.appendHint')}
            </Text>
          </Flex>
        )}
      </div>

      <Modal
        title={t('files.chooseLibraryTitle')}
        open={libraryOpen}
        onCancel={() => setLibraryOpen(false)}
        footer={null}
        width={760}
        destroyOnHidden
      >
        <Flex vertical gap={12}>
          <Flex gap={8} wrap="wrap">
            <Input
              allowClear
              prefix={<Search size={15} />}
              placeholder={t('files.searchLibraryPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={() => void loadLibrary()}
              style={{ flex: 1, minWidth: 220 }}
            />
            <Select
              value={kind}
              options={kindFilter === 'all' ? kindOptions : kindOptions.filter((item) => item.value === kindFilter)}
              onChange={setKind}
              style={{ width: 120 }}
              disabled={kindFilter !== 'all'}
            />
            <Button icon={<Search size={15} />} onClick={() => void loadLibrary()}>{t('files.search')}</Button>
            <Upload
              showUploadList={false}
              accept={accept}
              beforeUpload={(file, list) => {
                const rawList = uploadFilesFromAnt(file as unknown as File, list, 'attachment');
                if (file.uid === list[0]?.uid) void uploadFiles(rawList);
                return false;
              }}
              multiple={!single}
            >
              <Button icon={<Plus size={15} />} loading={uploading}>{t('common.upload')}</Button>
            </Upload>
          </Flex>
          <Table<FileAsset>
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={files}
            loading={loading}
            pagination={{ pageSize: 8 }}
            scroll={{ x: 620 }}
          />
        </Flex>
      </Modal>

      <FilePreviewModal asset={preview} open={!!preview} onClose={() => setPreview(null)} />
    </Flex>
  );
};

export default AttachmentPicker;
