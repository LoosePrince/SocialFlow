import { Alert, Button, Empty, Flex, Modal, Spin, Tree, Typography, theme } from 'antd';
import type { DataNode } from 'antd/es/tree';
import JSZip from 'jszip';
import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, ExternalLink } from 'lucide-react';
import { fileAssetUrl, formatFileSize, isPdf, isPreviewableText, isZip, type FileAsset } from '../lib/files';
import { GithubCdnImg } from './GithubCdnImg';
import { useI18n } from '../context/I18nContext';

const { Text, Paragraph } = Typography;

type Props = {
  asset: FileAsset | null;
  open: boolean;
  onClose: () => void;
};

function zipNodesFromEntries(zip: JSZip): DataNode[] {
  const root: Record<string, any> = {};
  zip.forEach((path, entry) => {
    const parts = path.split('/').filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      current[part] ??= { title: part, key: parts.slice(0, index + 1).join('/'), children: {}, isLeaf: false };
      if (index === parts.length - 1 && !entry.dir) {
        current[part].title = part;
        current[part].isLeaf = true;
      }
      current = current[part].children;
    });
  });
  const walk = (node: Record<string, any>): DataNode[] =>
    Object.values(node).map((item: any) => ({
      title: item.title,
      key: item.key,
      isLeaf: item.isLeaf,
      children: item.isLeaf ? undefined : walk(item.children),
    }));
  return walk(root);
}

const FilePreviewModal: React.FC<Props> = ({ asset, open, onClose }) => {
  const { token } = theme.useToken();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [tree, setTree] = useState<DataNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const url = useMemo(() => (asset ? fileAssetUrl(asset) : ''), [asset]);

  useEffect(() => {
    if (!open || !asset) return;
    setText('');
    setTree([]);
    setError('');

    if (isPreviewableText(asset) && asset.size <= 1024 * 1024) {
      setLoading(true);
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.text();
        })
        .then(setText)
        .catch(() => setError(t('files.previewTextFailed')))
        .finally(() => setLoading(false));
      return;
    }

    if (isZip(asset) && asset.size <= 25 * 1024 * 1024) {
      setLoading(true);
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.arrayBuffer();
        })
        .then((buf) => JSZip.loadAsync(buf))
        .then((zip) => setTree(zipNodesFromEntries(zip)))
        .catch(() => setError(t('files.previewArchiveFailed')))
        .finally(() => setLoading(false));
    }
  }, [asset, open, url]);

  const body = () => {
    if (!asset) return null;
    if (loading) {
      return (
        <Flex justify="center" align="center" style={{ minHeight: 220 }}>
          <Spin />
        </Flex>
      );
    }
    if (error) return <Alert type="warning" showIcon message={error} />;

    if (asset.kind === 'image') {
      return <GithubCdnImg src={url} alt={asset.name} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }} />;
    }
    if (asset.kind === 'audio') {
      return <audio controls src={url} style={{ width: '100%' }} />;
    }
    if (asset.kind === 'video') {
      return <video controls src={url} style={{ width: '100%', maxHeight: '70vh' }} />;
    }
    if (isPdf(asset)) {
      return <iframe title={asset.name} src={url} style={{ width: '100%', height: '70vh', border: 0 }} />;
    }
    if (isPreviewableText(asset) && text) {
      if (asset.ext === '.md' || asset.ext === '.markdown') {
        return (
          <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: 16 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        );
      }
      return (
        <pre
          style={{
            maxHeight: '70vh',
            overflow: 'auto',
            margin: 0,
            padding: 16,
            background: token.colorFillAlter,
            borderRadius: token.borderRadius,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </pre>
      );
    }
    if (isZip(asset)) {
      return tree.length > 0 ? (
        <Tree treeData={tree} defaultExpandAll height={420} />
      ) : (
        <Empty description={t('files.archivePreviewEmpty')} />
      );
    }
    return (
      <Flex vertical gap={8}>
        <Paragraph style={{ margin: 0 }}>
          <Text strong>{asset.name}</Text>
        </Paragraph>
        <Text type="secondary">{asset.mime || 'application/octet-stream'} · {formatFileSize(asset.size)}</Text>
        <Text type="secondary">{t('files.previewUnsupported')}</Text>
      </Flex>
    );
  };

  return (
    <Modal
      title={asset?.name ?? t('files.previewTitle')}
      open={open}
      onCancel={onClose}
      width={asset && (isPdf(asset) || asset.kind === 'image' || asset.kind === 'video') ? 900 : 680}
      footer={
        asset
          ? [
              <Button key="open" icon={<ExternalLink size={15} />} href={url} target="_blank" rel="noreferrer">
                {t('files.openInNewWindow')}
              </Button>,
              <Button key="download" type="primary" icon={<Download size={15} />} href={url} download={asset.name}>
                {t('files.download')}
              </Button>,
            ]
          : null
      }
      destroyOnHidden
    >
      {body()}
    </Modal>
  );
};

export default FilePreviewModal;
