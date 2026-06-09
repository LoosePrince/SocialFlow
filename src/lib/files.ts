import { getGithubUrl } from '../github';
import { apiFetch, apiJson } from './api';

export type FileKind = 'image' | 'audio' | 'video' | 'document' | 'archive' | 'file';

export type FileAsset = {
  id: string;
  ownerid: string;
  folderid: string | null;
  path: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  ext: string;
  kind: FileKind;
  checksum: string;
  createdat: number;
  updatedat: number;
  ownerName?: string;
};

export type FileFolder = {
  id: string;
  ownerid: string;
  parentid: string | null;
  name: string;
  createdat: number;
  updatedat: number;
};

export function fileAssetUrl(asset: Pick<FileAsset, 'url' | 'path'>): string {
  return asset.url || getGithubUrl(asset.path);
}

export function formatFileSize(size: number | undefined): string {
  const value = Number(size ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current >= 10 || unit === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[unit]}`;
}

export function isPreviewableText(asset: FileAsset): boolean {
  const mime = asset.mime.toLowerCase();
  const ext = asset.ext.toLowerCase();
  return (
    mime.startsWith('text/') ||
    ['.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.css', '.js', '.jsx', '.ts', '.tsx', '.sql', '.log'].includes(ext)
  );
}

export function isPdf(asset: FileAsset): boolean {
  return asset.mime.toLowerCase() === 'application/pdf' || asset.ext.toLowerCase() === '.pdf';
}

export function isZip(asset: FileAsset): boolean {
  return asset.ext.toLowerCase() === '.zip' || asset.mime.toLowerCase().includes('zip');
}

export function inferFileKind(name: string, mime = ''): FileKind {
  const lowerMime = mime.toLowerCase();
  const cleanName = name.split(/[?#]/)[0] ?? '';
  const dot = cleanName.lastIndexOf('.');
  const ext = dot >= 0 ? cleanName.slice(dot).toLowerCase() : '';
  if (lowerMime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif'].includes(ext)) return 'image';
  if (lowerMime.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'].includes(ext)) return 'audio';
  if (lowerMime.startsWith('video/') || ['.mp4', '.webm', '.mov', '.mkv', '.avi'].includes(ext)) return 'video';
  if (
    lowerMime.includes('zip') ||
    lowerMime.includes('compressed') ||
    ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz'].includes(ext)
  ) {
    return 'archive';
  }
  if (
    lowerMime === 'application/pdf' ||
    lowerMime.startsWith('text/') ||
    lowerMime.includes('officedocument') ||
    lowerMime.includes('msword') ||
    lowerMime.includes('ms-excel') ||
    lowerMime.includes('ms-powerpoint') ||
    ['.pdf', '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.css', '.js', '.jsx', '.ts', '.tsx', '.sql', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)
  ) {
    return 'document';
  }
  return 'file';
}

export function legacyFileAssetFromPath(path: string, preferredKind?: FileKind): FileAsset {
  const cleanPath = String(path || '').trim();
  const rawName = cleanPath.split(/[\\/]/).pop()?.split(/[?#]/)[0] || 'file';
  const name = decodeURIComponent(rawName);
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  const kind = preferredKind ?? inferFileKind(name);
  return {
    id: `legacy:${cleanPath}`,
    ownerid: '',
    folderid: null,
    path: cleanPath,
    url: '',
    name,
    mime: '',
    size: 0,
    ext,
    kind,
    checksum: '',
    createdat: 0,
    updatedat: 0,
  };
}

export function isPersistedFileAsset(asset: Pick<FileAsset, 'id'>): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(asset.id);
}

export function mergeFileAssetsByPath(assets: FileAsset[]): FileAsset[] {
  const seen = new Set<string>();
  const merged: FileAsset[] = [];
  for (const asset of assets) {
    const key = (asset.path || asset.url || asset.id).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(asset);
  }
  return merged;
}

export async function uploadFileAsset(file: File, folderId?: string | null): Promise<FileAsset> {
  const fd = new FormData();
  fd.append('file', file);
  if (folderId) fd.append('folderId', folderId);
  const res = await apiFetch('/api/files/upload', { method: 'POST', body: fd });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Upload failed');
  }
  return res.json() as Promise<FileAsset>;
}

export function listFiles(params: {
  folderId?: string | null;
  q?: string;
  kind?: string;
  all?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<FileAsset[]> {
  const qs = new URLSearchParams();
  if (params.folderId !== undefined) qs.set('folderId', params.folderId ?? 'root');
  if (params.q) qs.set('q', params.q);
  if (params.kind && params.kind !== 'all') qs.set('kind', params.kind);
  if (params.all) qs.set('all', 'true');
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  return apiJson<FileAsset[]>(`/api/files${qs.toString() ? `?${qs}` : ''}`);
}

export function listFolders(all = false): Promise<FileFolder[]> {
  return apiJson<FileFolder[]>(`/api/files/folders${all ? '?all=true' : ''}`);
}

export function createFolder(name: string, parentid?: string | null): Promise<FileFolder> {
  return apiJson<FileFolder>('/api/files/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentid: parentid ?? null }),
  });
}

export function updateFolder(id: string, body: { name?: string; parentid?: string | null }): Promise<FileFolder> {
  return apiJson<FileFolder>(`/api/files/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteFolder(id: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/api/files/folders/${id}`, { method: 'DELETE' });
}

export function updateFileAsset(id: string, body: { name?: string; folderid?: string | null }): Promise<FileAsset> {
  return apiJson<FileAsset>(`/api/files/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteFileAsset(id: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/api/files/${id}`, { method: 'DELETE' });
}
