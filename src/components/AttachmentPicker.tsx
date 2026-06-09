import { App, Button, Empty, Flex, Input, Modal, Select, Space, Table, Tag, Upload, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, File, FileAudio, FileImage, FileText, FileVideo, FolderOpen, Plus, Search, UploadCloud, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { formatFileSize, inferFileKind, listFiles, uploadFileAsset, type FileAsset, type FileKind } from '../lib/files';
import { filesFromClipboard, filesFromDataTransfer, uploadFilesFromAnt } from '../lib/fileInput';
import FilePreviewModal from './FilePreviewModal';

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

const kindOptions = [
  { label: '全部', value: 'all' },
  { label: '图片', value: 'image' },
  { label: '音频', value: 'audio' },
  { label: '视频', value: 'video' },
  { label: '文档', value: 'document' },
  { label: '压缩包', value: 'archive' },
  { label: '文件', value: 'file' },
];

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
  label = '附件',
  accept,
  kindFilter = 'all',
  single = false,
}) => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
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

  useEffect(() => {
    setKind(kindFilter);
  }, [kindFilter]);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      setFiles(await listFiles({ q: query, kind, limit: 100 }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '资源库加载失败');
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
        message.warning(kindFilter === 'image' ? '请选择图片文件' : '文件类型不符合要求');
        continue;
      }
      if (!single && next.some((item) => item.id === asset.id)) continue;
      if (asset.kind === 'image' && maxImages && next.filter((item) => item.kind === 'image').length >= maxImages) {
        message.warning(`图片最多 ${maxImages} 张`);
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
      message.warning(kindFilter === 'image' ? '已跳过非图片文件' : `已跳过 ${skippedByKind} 个类型不符合的文件`);
    }
    if (skippedByLimit > 0) {
      message.warning(`图片最多 ${maxImages} 张，已跳过多余图片`);
    }
    return next;
  };

  const uploadFiles = async (filesToUpload: File[]) => {
    const candidates = filterUploadFiles(filesToUpload);
    if (candidates.length === 0) {
      message.info('没有可上传的文件');
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
          failed.push(error instanceof Error ? error.message : `${file.name} 上传失败`);
        }
      }
      if (uploaded.length > 0) {
        addAssets(uploaded);
        if (libraryOpen) void loadLibrary();
      }
      if (uploaded.length > 0 && failed.length === 0) {
        message.success(uploaded.length === 1 ? '附件已上传' : `已上传 ${uploaded.length} 个附件`);
      } else if (uploaded.length > 0) {
        message.warning(`已上传 ${uploaded.length} 个，${failed.length} 个失败`);
      } else {
        message.error(failed[0] || '上传失败');
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
      title: '文件',
      dataIndex: 'name',
      render: (_, record) => (
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          {iconMap[record.kind] ?? iconMap.file}
          <Text ellipsis style={{ maxWidth: 260 }}>{record.name}</Text>
        </Flex>
      ),
    },
    {
      title: '类型',
      dataIndex: 'kind',
      width: 90,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: '大小',
      dataIndex: 'size',
      width: 100,
      render: (v) => formatFileSize(v),
    },
    {
      title: '操作',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => setPreview(record)}>预览</Button>
          <Button size="small" type="primary" disabled={selectedIds.has(record.id)} onClick={() => addAssets([record])}>
            选择
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={10}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={8}>
        <Text type="secondary">
          {label}{maxImages ? ` · 图片 ${imageCount}/${maxImages}` : ''}
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
              上传
            </Button>
          </Upload>
          <Button icon={<FolderOpen size={15} />} onClick={() => setLibraryOpen(true)}>
            从资源库选择
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
            description={single ? '拖拽或粘贴文件，也可点击上传' : '拖拽或粘贴附件到这里'}
          />
        ) : (
          <Flex vertical gap={8}>
            {value.map((asset) => (
              <Flex key={asset.id} align="center" gap={8} style={{ minWidth: 0 }}>
                {iconMap[asset.kind] ?? iconMap.file}
                <Text ellipsis style={{ flex: 1 }}>{asset.name}</Text>
                <Tag>{asset.kind}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>{formatFileSize(asset.size)}</Text>
                <Button size="small" type="text" onClick={() => setPreview(asset)}>打开</Button>
                <Button size="small" type="text" icon={<X size={14} />} onClick={() => removeAsset(asset.id)} />
              </Flex>
            ))}
            <Text type="secondary" style={{ fontSize: 12 }}>
              可继续拖拽或粘贴文件追加上传
            </Text>
          </Flex>
        )}
      </div>

      <Modal
        title="选择资源库文件"
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
              placeholder="搜索文件名、路径或类型"
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
            <Button icon={<Search size={15} />} onClick={() => void loadLibrary()}>搜索</Button>
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
              <Button icon={<Plus size={15} />} loading={uploading}>上传</Button>
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
