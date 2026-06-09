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
  Segmented,
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
  Grid2X2,
  List as ListIcon,
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
import PageHeader from '../components/PageHeader';
import ResponsiveContainer from '../components/ResponsiveContainer';

const { Text } = Typography;
const { useBreakpoint } = Grid;

const FILES_VIEW_MODE_KEY = 'socialflow.files.viewMode';
type FilesViewMode = 'list' | 'grid';

function readFilesViewMode(): FilesViewMode {
  if (typeof window === 'undefined') return 'list';
  const cached = window.localStorage.getItem(FILES_VIEW_MODE_KEY);
  return cached === 'grid' ? 'grid' : 'list';
}

const iconMap: Record<FileKind, React.ReactNode> = {
  image: <FileImage size={18} />,
  audio: <FileAudio size={18} />,
  video: <FileVideo size={18} />,
  document: <FileText size={18} />,
  archive: <Archive size={18} />,
  file: <File size={18} />,
};

function folderTreeData(folders: FileFolder[], rootTitle: string): DataNode[] {
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
      title: rootTitle,
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
  const [viewMode, setViewMode] = useState<FilesViewMode>(readFilesViewMode);

  const isAdmin = profile?.role === 'admin';
  const treeData = useMemo(() => folderTreeData(folders, t('files.allFiles')), [folders, t]);
  const currentFolderId = selectedFolder === 'root' ? null : selectedFolder;
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
    window.localStorage.setItem(FILES_VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

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
      message.info(t('files.noUploadable'));
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
          failed.push(error instanceof Error ? error.message : t('files.uploadFileFailed', { name: file.name }));
        }
      }
      if (succeeded > 0) {
        await reload();
      }
      if (succeeded > 0 && failed.length === 0) {
        message.success(succeeded === 1 ? t('files.uploadedOne') : t('files.uploadedMany', { count: succeeded }));
      } else if (succeeded > 0) {
        message.warning(t('files.uploadedPartial', { success: succeeded, failed: failed.length }));
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
      title: t('files.createFolderTitle'),
      content: (
        <Input
          autoFocus
          placeholder={t('files.folderName')}
          onChange={(event) => {
            name = event.target.value;
          }}
          onPressEnter={() => {
            const okButton = document.querySelector<HTMLElement>('.ant-modal-confirm-btns .ant-btn-primary');
            okButton?.click();
          }}
        />
      ),
      okText: t('files.create'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const trimmed = name.trim();
        if (!trimmed) {
          message.warning(t('files.folderNameRequired'));
          return Promise.reject();
        }
        await createFolder(trimmed, currentFolderId);
        message.success(t('files.folderCreated'));
        await loadFolders();
      },
    });
  };

  const promptRenameFile = (asset: FileAsset) => {
    let name = asset.name;
    modal.confirm({
      title: t('files.renameFileTitle'),
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
          message.warning(t('files.fileNameRequired'));
          return Promise.reject();
        }
        await updateFileAsset(asset.id, { name: trimmed });
        message.success(t('files.fileRenamed'));
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
      title: t('files.renameFolderTitle'),
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
          message.warning(t('files.folderNameRequired'));
          return Promise.reject();
        }
        await updateFolder(folder.id, { name: trimmed });
        message.success(t('files.folderRenamed'));
        await loadFolders();
      },
    });
  };

  const confirmDeleteFolder = () => {
    if (!currentFolderId) return;
    modal.confirm({
      title: t('files.deleteFolderTitle'),
      content: t('files.deleteFolderContent'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteFolder(currentFolderId);
        setSelectedFolder('root');
        message.success(t('files.folderDeleted'));
        await reload();
      },
    });
  };

  const moveFile = async (asset: FileAsset, folderid: string | null) => {
    await updateFileAsset(asset.id, { folderid });
    message.success(t('files.fileMoved'));
    await loadFiles();
  };

  const confirmDeleteFile = (asset: FileAsset) => {
    modal.confirm({
      title: t('files.deleteFileTitle'),
      content: t('files.deleteFileContent', { name: asset.name }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteFileAsset(asset.id);
        message.success(t('files.fileDeleted'));
        await loadFiles();
      },
    });
  };

  const copyLink = async (asset: FileAsset) => {
    try {
      await navigator.clipboard.writeText(fileAssetUrl(asset));
      message.success(t('share.linkCopied'));
    } catch {
      message.error(t('share.copyFailed'));
    }
  };

  const columns: ColumnsType<FileAsset> = [
    {
      title: t('files.name'),
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
      title: t('files.kind'),
      dataIndex: 'kind',
      width: 95,
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: t('files.size'),
      dataIndex: 'size',
      width: 100,
      render: (value) => formatFileSize(value),
    },
    ...(showAll
      ? [
          {
            title: t('files.owner'),
            dataIndex: 'ownerName',
            width: 120,
            render: (value: string) => value || '-',
          },
        ] as ColumnsType<FileAsset>
      : []),
    {
      title: t('files.location'),
      dataIndex: 'folderid',
      width: 160,
      render: (_, record) => (
        <Select
          size="small"
          value={record.folderid ?? 'root'}
          style={{ width: 140 }}
          onChange={(value) => void moveFile(record, value === 'root' ? null : value)}
          options={[
            { label: t('files.allFiles'), value: 'root' },
            ...folders
              .filter((folder) => folder.ownerid === record.ownerid)
              .map((folder) => ({ label: folder.name, value: folder.id })),
          ]}
        />
      ),
    },
    {
      title: t('files.actions'),
      width: 220,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title={t('files.preview')}>
            <Button size="small" type="text" icon={<Eye size={15} />} onClick={() => setPreview(record)} />
          </Tooltip>
          <Tooltip title={t('files.download')}>
            <Button size="small" type="text" icon={<Download size={15} />} href={fileAssetUrl(record)} download={record.name} />
          </Tooltip>
          <Tooltip title={t('files.copyLink')}>
            <Button size="small" type="text" icon={<Copy size={15} />} onClick={() => void copyLink(record)} />
          </Tooltip>
          <Button size="small" type="link" onClick={() => promptRenameFile(record)}>
            {t('files.rename')}
          </Button>
          <Tooltip title={t('files.delete')}>
            <Button size="small" danger type="text" icon={<Trash2 size={15} />} onClick={() => confirmDeleteFile(record)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const viewModeControl = (
    <Segmented
      value={viewMode}
      onChange={(value) => setViewMode(value as FilesViewMode)}
      options={[
        {
          label: (
            <Space size={4}>
              <ListIcon size={14} />
              {t('files.viewList')}
            </Space>
          ),
          value: 'list',
        },
        {
          label: (
            <Space size={4}>
              <Grid2X2 size={14} />
              {t('files.viewGrid')}
            </Space>
          ),
          value: 'grid',
        },
      ]}
    />
  );

  const renderFileCard = (asset: FileAsset, mode: 'list' | 'grid') => {
    const url = fileAssetUrl(asset);
    const folderOptions = [
      { label: t('files.allFiles'), value: 'root' },
      ...folders
        .filter((folder) => folder.ownerid === asset.ownerid)
        .map((folder) => ({ label: folder.name, value: folder.id })),
    ];

    if (mode === 'grid') {
      return (
        <Card
          key={asset.id}
          className="sf-file-tile"
          styles={{ body: { padding: 10 } }}
          cover={
            <div className="sf-file-thumb" style={{ background: token.colorFillAlter }}>
              {asset.kind === 'image' ? (
                <img
                  src={url}
                  alt={asset.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <span style={{ color: token.colorTextSecondary, display: 'flex' }}>
                  {iconMap[asset.kind] ?? iconMap.file}
                </span>
              )}
            </div>
          }
        >
          <Flex vertical gap={8}>
            <Flex vertical style={{ minWidth: 0 }}>
              <Text ellipsis strong title={asset.name}>
                {asset.name}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatFileSize(asset.size)} · {asset.kind}
              </Text>
            </Flex>
            <Flex gap={4} wrap="wrap">
              <Tooltip title={t('files.preview')}>
                <Button size="small" type="text" icon={<Eye size={15} />} onClick={() => setPreview(asset)} />
              </Tooltip>
              <Tooltip title={t('files.download')}>
                <Button size="small" type="text" icon={<Download size={15} />} href={url} download={asset.name} />
              </Tooltip>
              <Tooltip title={t('files.copyLink')}>
                <Button size="small" type="text" icon={<Copy size={15} />} onClick={() => void copyLink(asset)} />
              </Tooltip>
              <Button size="small" type="text" onClick={() => promptRenameFile(asset)}>
                {t('files.rename')}
              </Button>
              <Tooltip title={t('files.delete')}>
                <Button size="small" danger type="text" icon={<Trash2 size={15} />} onClick={() => confirmDeleteFile(asset)} />
              </Tooltip>
            </Flex>
          </Flex>
        </Card>
      );
    }

    return (
      <Card key={asset.id} className="sf-soft-panel" styles={{ body: { padding: 12 } }}>
        <Flex gap={10} align="start">
          <span style={{ color: token.colorTextSecondary, display: 'flex', marginTop: 2 }}>
            {iconMap[asset.kind] ?? iconMap.file}
          </span>
          <Flex vertical gap={8} style={{ flex: 1, minWidth: 0 }}>
            <Flex vertical style={{ minWidth: 0 }}>
              <Text ellipsis strong title={asset.name}>
                {asset.name}
              </Text>
              <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                {asset.path}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatFileSize(asset.size)} · {asset.kind}
              </Text>
            </Flex>
            <Select
              size="small"
              value={asset.folderid ?? 'root'}
              onChange={(value) => void moveFile(asset, value === 'root' ? null : value)}
              options={folderOptions}
            />
            <Flex gap={4} wrap="wrap">
              <Button size="small" icon={<Eye size={15} />} onClick={() => setPreview(asset)}>
                {t('files.preview')}
              </Button>
              <Button size="small" icon={<Download size={15} />} href={url} download={asset.name}>
                {t('files.download')}
              </Button>
              <Button size="small" icon={<Copy size={15} />} onClick={() => void copyLink(asset)}>
                {t('files.copyLink')}
              </Button>
              <Button size="small" onClick={() => promptRenameFile(asset)}>
                {t('files.rename')}
              </Button>
              <Button size="small" danger icon={<Trash2 size={15} />} onClick={() => confirmDeleteFile(asset)}>
                {t('files.delete')}
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </Card>
    );
  };

  const renderFileContent = () => {
    if (loading) {
      return (
        <Table<FileAsset>
          rowKey="id"
          columns={columns}
          dataSource={[]}
          loading
          pagination={false}
          scroll={{ x: 840 }}
        />
      );
    }

    if (files.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('files.empty')} />;
    }

    if (viewMode === 'grid') {
      return <div className="sf-file-grid">{files.map((asset) => renderFileCard(asset, 'grid'))}</div>;
    }

    if (!screens.md) {
      return <Flex vertical gap={10}>{files.map((asset) => renderFileCard(asset, 'list'))}</Flex>;
    }

    return (
      <Table<FileAsset>
        rowKey="id"
        columns={columns}
        dataSource={files}
        loading={loading}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('files.empty')} /> }}
        pagination={{ pageSize: 12, showSizeChanger: false }}
        scroll={{ x: 840 }}
      />
    );
  };

  return (
    <ResponsiveContainer
      wide
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
    >
      <PageHeader
        title={t('files.title')}
        description={t('files.desc')}
        level={screens.md ? 2 : 3}
        actions={
          <Space wrap>
            {viewModeControl}
            {isAdmin && (
              <Select
                value={showAll ? 'all' : 'mine'}
                onChange={(value) => setShowAll(value === 'all')}
                style={{ width: 130 }}
                options={[
                  { label: t('files.mine'), value: 'mine' },
                  { label: t('files.allSite'), value: 'all' },
                ]}
              />
            )}
            <Button icon={<Plus size={15} />} onClick={promptCreateFolder}>
              {t('files.newFolder')}
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
                {t('files.upload')}
              </Button>
            </Upload>
          </Space>
        }
      />

      <Flex gap={16} align="stretch" vertical={!screens.md}>
        <Card
          className="sf-soft-panel"
          style={{
            width: screens.md ? 260 : '100%',
            flex: 'none',
            borderRadius: token.borderRadiusLG,
          }}
          styles={{ body: { padding: 12 } }}
        >
          <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
            <Text strong>{t('files.folders')}</Text>
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
                {t('files.rename')}
              </Button>
              <Button size="small" danger onClick={confirmDeleteFolder}>
                {t('files.delete')}
              </Button>
            </Flex>
          )}
        </Card>

        <Card
          className="sf-soft-panel"
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
                  <Text strong>{uploading ? t('files.uploading') : t('files.dropHint')}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('files.currentFolder', {
                      name: currentFolderId
                        ? folders.find((folder) => folder.id === currentFolderId)?.name ?? t('files.selectedFolder')
                        : t('files.allFiles'),
                    })}
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
                  {t('files.chooseFiles')}
                </Button>
              </Upload>
            </Flex>
          </div>
          <Flex gap={8} wrap="wrap" style={{ marginBottom: 12 }}>
            <Input
              allowClear
              prefix={<Search size={16} />}
              placeholder={t('files.searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={() => void loadFiles()}
              style={{ flex: 1, minWidth: 220 }}
            />
            <Select value={kind} options={kindOptions} onChange={setKind} style={{ width: 130 }} />
            <Button icon={<Search size={15} />} onClick={() => void loadFiles()}>
              {t('files.search')}
            </Button>
          </Flex>
          {renderFileContent()}
        </Card>
      </Flex>

      <FilePreviewModal asset={preview} open={!!preview} onClose={() => setPreview(null)} />
    </ResponsiveContainer>
  );
};

export default Files;
