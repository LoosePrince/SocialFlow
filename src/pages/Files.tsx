import {
  App,
  Button,
  Card,
  Empty,
  Flex,
  Grid,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
  Upload,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import {
  Archive,
  Copy,
  Download,
  Eye,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  createFolder,
  deleteFileAsset,
  deleteFolder,
  fileAssetUrl,
  formatFileSize,
  listFiles,
  listFolders,
  updateFileAsset,
  updateFolder,
  uploadFileAsset,
  type FileAsset,
  type FileFolder,
  type FileKind,
} from '../lib/files';
import { filesFromClipboard, filesFromDataTransfer, uploadFilesFromAnt } from '../lib/fileInput';
import FilePreviewModal from '../components/FilePreviewModal';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const kindOptions = [
  { label: '全部类型', value: 'all' },
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

function folderTreeData(folders: FileFolder[]): DataNode[] {
  const nodes = new Map<string, DataNode>();
  folders.forEach((folder) => {
    nodes.set(folder.id, {
      key: folder.id,
      title: folder.name,
      icon: <Folder size={15} />,
      children: [],
    });
  });

  const roots: DataNode[] = [
    {
      key: 'root',
      title: '全部文件',
      icon: <FolderOpen size={15} />,
      children: [],
    },
  ];

  folders.forEach((folder) => {
    const node = nodes.get(folder.id);
    if (!node) return;
    if (folder.parentid && nodes.has(folder.parentid)) {
      (nodes.get(folder.parentid)?.children as DataNode[] | undefined)?.push(node);
    } else {
      (roots[0].children as DataNode[]).push(node);
    }
  });

  return roots;
}

const Files: React.FC = () => {
  const { profile } = useAuth();
  const { t } = useI18n();
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const { message, modal } = App.useApp();
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [files, setFiles] = useState<FileAsset[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('root');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<FileAsset | null>(null);

  const isAdmin = profile?.role === 'admin';
  const treeData = useMemo(() => folderTreeData(folders), [folders]);
  const currentFolderId = selectedFolder === 'root' ? null : selectedFolder;

  const loadFolders = async () => {
    setFolders(await listFolders(showAll));
  };

  const loadFiles = async () => {
    setLoading(true);
    try {
      const next = await listFiles({
        folderId: currentFolderId,
        q: query,
        kind,
        all: showAll,
        limit: 200,
      });
      setFiles(next);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('common.requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const reload = async () => {
    try {
      await Promise.all([loadFolders(), loadFiles()]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('common.requestFailed'));
    }
  };

  useEffect(() => {
    void reload();
  }, [selectedFolder, kind, showAll]);

  const handleUpload = async (items: File[]) => {
    if (items.length === 0) {
      message.info('没有可上传的文件');
      return;
    }
    setUploading(true);
    let succeeded = 0;
    const failed: string[] = [];
    try {
      for (const file of items) {
        try {
          await uploadFileAsset(file, currentFolderId);
          succeeded += 1;
        } catch (error) {
          failed.push(error instanceof Error ? error.message : `${file.name} 上传失败`);
        }
      }
      if (succeeded > 0) {
        await reload();
      }
      if (succeeded > 0 && failed.length === 0) {
        message.success(succeeded === 1 ? '文件已上传' : `已上传 ${succeeded} 个文件`);
      } else if (succeeded > 0) {
        message.warning(`已上传 ${succeeded} 个，${failed.length} 个失败`);
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
    const dropped = filesFromDataTransfer(event.dataTransfer, 'file');
    if (dropped.length > 0) void handleUpload(dropped);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = filesFromClipboard(event.clipboardData, 'file');
    if (pasted.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    void handleUpload(pasted);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDragActive(false);
  };

  const promptCreateFolder = () => {
    let name = '';
    modal.confirm({
      title: '新建文件夹',
      content: (
        <Input
          autoFocus
          placeholder="文件夹名称"
          onChange={(event) => {
            name = event.target.value;
          }}
          onPressEnter={() => {
            const okButton = document.querySelector<HTMLElement>('.ant-modal-confirm-btns .ant-btn-primary');
            okButton?.click();
          }}
        />
      ),
      okText: '创建',
      cancelText: t('common.cancel'),
      onOk: async () => {
        const trimmed = name.trim();
        if (!trimmed) {
          message.warning('请输入文件夹名称');
          return Promise.reject();
        }
        await createFolder(trimmed, currentFolderId);
        message.success('文件夹已创建');
        await loadFolders();
      },
    });
  };

  const promptRenameFile = (asset: FileAsset) => {
    let name = asset.name;
    modal.confirm({
      title: '重命名文件',
      content: (
        <Input
          defaultValue={asset.name}
          onChange={(event) => {
            name = event.target.value;
          }}
        />
      ),
      okText: t('common.save'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const trimmed = name.trim();
        if (!trimmed) {
          message.warning('请输入文件名');
          return Promise.reject();
        }
        await updateFileAsset(asset.id, { name: trimmed });
        message.success('文件名已更新');
        await loadFiles();
      },
    });
  };

  const promptRenameFolder = () => {
    if (!currentFolderId) return;
    const folder = folders.find((item) => item.id === currentFolderId);
    if (!folder) return;
    let name = folder.name;
    modal.confirm({
      title: '重命名文件夹',
      content: (
        <Input
          defaultValue={folder.name}
          onChange={(event) => {
            name = event.target.value;
          }}
        />
      ),
      okText: t('common.save'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const trimmed = name.trim();
        if (!trimmed) {
          message.warning('请输入文件夹名称');
          return Promise.reject();
        }
        await updateFolder(folder.id, { name: trimmed });
        message.success('文件夹已更新');
        await loadFolders();
      },
    });
  };

  const confirmDeleteFolder = () => {
    if (!currentFolderId) return;
    modal.confirm({
      title: '删除文件夹？',
      content: '文件夹内的文件会移回根目录，文件本体不会被删除。',
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteFolder(currentFolderId);
        setSelectedFolder('root');
        message.success('文件夹已删除');
        await reload();
      },
    });
  };

  const moveFile = async (asset: FileAsset, folderid: string | null) => {
    await updateFileAsset(asset.id, { folderid });
    message.success('文件已移动');
    await loadFiles();
  };

  const confirmDeleteFile = (asset: FileAsset) => {
    modal.confirm({
      title: '删除文件？',
      content: `${asset.name} 将从资源库和 GitHub 存储中删除。`,
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteFileAsset(asset.id);
        message.success('文件已删除');
        await loadFiles();
      },
    });
  };

  const copyLink = async (asset: FileAsset) => {
    try {
      await navigator.clipboard.writeText(fileAssetUrl(asset));
      message.success('链接已复制');
    } catch {
      message.error('复制失败');
    }
  };

  const columns: ColumnsType<FileAsset> = [
    {
      title: '文件名',
      dataIndex: 'name',
      render: (_, record) => (
        <Flex align="center" gap={10} style={{ minWidth: 0 }}>
          <span style={{ color: token.colorTextSecondary, display: 'flex' }}>
            {iconMap[record.kind] ?? iconMap.file}
          </span>
          <Flex vertical style={{ minWidth: 0 }}>
            <Text ellipsis strong style={{ maxWidth: screens.md ? 320 : 180 }}>
              {record.name}
            </Text>
            <Text type="secondary" ellipsis style={{ maxWidth: screens.md ? 360 : 180, fontSize: 12 }}>
              {record.path}
            </Text>
          </Flex>
        </Flex>
      ),
    },
    {
      title: '类型',
      dataIndex: 'kind',
      width: 95,
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: '大小',
      dataIndex: 'size',
      width: 100,
      render: (value) => formatFileSize(value),
    },
    ...(showAll
      ? [
          {
            title: '所有者',
            dataIndex: 'ownerName',
            width: 120,
            render: (value: string) => value || '-',
          },
        ] as ColumnsType<FileAsset>
      : []),
    {
      title: '位置',
      dataIndex: 'folderid',
      width: 160,
      render: (_, record) => (
        <Select
          size="small"
          value={record.folderid ?? 'root'}
          style={{ width: 140 }}
          onChange={(value) => void moveFile(record, value === 'root' ? null : value)}
          options={[
            { label: '全部文件', value: 'root' },
            ...folders
              .filter((folder) => folder.ownerid === record.ownerid)
              .map((folder) => ({ label: folder.name, value: folder.id })),
          ]}
        />
      ),
    },
    {
      title: '操作',
      width: 220,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="预览">
            <Button size="small" type="text" icon={<Eye size={15} />} onClick={() => setPreview(record)} />
          </Tooltip>
          <Tooltip title="下载">
            <Button size="small" type="text" icon={<Download size={15} />} href={fileAssetUrl(record)} download={record.name} />
          </Tooltip>
          <Tooltip title="复制链接">
            <Button size="small" type="text" icon={<Copy size={15} />} onClick={() => void copyLink(record)} />
          </Tooltip>
          <Button size="small" type="link" onClick={() => promptRenameFile(record)}>
            重命名
          </Button>
          <Tooltip title="删除">
            <Button size="small" danger type="text" icon={<Trash2 size={15} />} onClick={() => confirmDeleteFile(record)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div
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
      style={{ maxWidth: 1120, margin: '0 auto' }}
    >
      <Flex align="center" justify="space-between" gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
        <div>
          <Title level={screens.md ? 2 : 3} style={{ margin: 0 }}>
            {t('files.title')}
          </Title>
          <Text type="secondary">{t('files.desc')}</Text>
        </div>
        <Space wrap>
          {isAdmin && (
            <Select
              value={showAll ? 'all' : 'mine'}
              onChange={(value) => setShowAll(value === 'all')}
              style={{ width: 130 }}
              options={[
                { label: '我的文件', value: 'mine' },
                { label: '全站文件', value: 'all' },
              ]}
            />
          )}
          <Button icon={<Plus size={15} />} onClick={promptCreateFolder}>
            新建目录
          </Button>
          <Upload
            showUploadList={false}
            beforeUpload={(file, list) => {
              const rawList = uploadFilesFromAnt(file as unknown as File, list, 'file');
              if (file.uid === list[0]?.uid) void handleUpload(rawList);
              return false;
            }}
            multiple
          >
            <Button type="primary" icon={<UploadCloud size={16} />} loading={uploading}>
              上传文件
            </Button>
          </Upload>
        </Space>
      </Flex>

      <Flex gap={16} align="stretch" vertical={!screens.md}>
        <Card
          style={{
            width: screens.md ? 260 : '100%',
            flex: 'none',
            borderRadius: token.borderRadiusLG,
          }}
          styles={{ body: { padding: 12 } }}
        >
          <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
            <Text strong>目录</Text>
            <Button size="small" type="text" icon={<RefreshCw size={14} />} onClick={() => void reload()} />
          </Flex>
          <Tree
            showIcon
            selectedKeys={[selectedFolder]}
            defaultExpandAll
            treeData={treeData}
            onSelect={(keys) => setSelectedFolder(String(keys[0] ?? 'root'))}
          />
          {currentFolderId && (
            <Flex gap={8} style={{ marginTop: 12 }}>
              <Button size="small" onClick={promptRenameFolder}>
                重命名
              </Button>
              <Button size="small" danger onClick={confirmDeleteFolder}>
                删除
              </Button>
            </Flex>
          )}
        </Card>

        <Card
          style={{ flex: 1, minWidth: 0, borderRadius: token.borderRadiusLG }}
          styles={{ body: { padding: screens.md ? 16 : 12 } }}
        >
          <div
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
            style={{
              border: `1px dashed ${dragActive ? token.colorPrimary : token.colorBorder}`,
              background: dragActive ? token.colorPrimaryBg : token.colorFillAlter,
              borderRadius: token.borderRadiusLG,
              padding: screens.md ? 14 : 12,
              marginBottom: 12,
              outline: 'none',
              transition: 'border-color .2s, background .2s',
            }}
          >
            <Flex align="center" justify="space-between" gap={12} wrap="wrap">
              <Flex align="center" gap={10} style={{ minWidth: 0 }}>
                <UploadCloud size={20} color={token.colorPrimary} />
                <Flex vertical style={{ minWidth: 0 }}>
                  <Text strong>{uploading ? '正在上传文件' : '拖拽或粘贴文件到这里'}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    当前目录：{currentFolderId ? folders.find((folder) => folder.id === currentFolderId)?.name ?? '已选目录' : '全部文件'}
                  </Text>
                </Flex>
              </Flex>
              <Upload
                showUploadList={false}
                beforeUpload={(file, list) => {
                  const rawList = uploadFilesFromAnt(file as unknown as File, list, 'file');
                  if (file.uid === list[0]?.uid) void handleUpload(rawList);
                  return false;
                }}
                multiple
              >
                <Button icon={<UploadCloud size={15} />} loading={uploading}>
                  选择文件
                </Button>
              </Upload>
            </Flex>
          </div>
          <Flex gap={8} wrap="wrap" style={{ marginBottom: 12 }}>
            <Input
              allowClear
              prefix={<Search size={16} />}
              placeholder="搜索文件名、路径或 MIME"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={() => void loadFiles()}
              style={{ flex: 1, minWidth: 220 }}
            />
            <Select value={kind} options={kindOptions} onChange={setKind} style={{ width: 130 }} />
            <Button icon={<Search size={15} />} onClick={() => void loadFiles()}>
              搜索
            </Button>
          </Flex>
          <Table<FileAsset>
            rowKey="id"
            columns={columns}
            dataSource={files}
            loading={loading}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件，可拖拽或粘贴上传" /> }}
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 840 }}
          />
        </Card>
      </Flex>

      <FilePreviewModal asset={preview} open={!!preview} onClose={() => setPreview(null)} />
    </div>
  );
};

export default Files;
