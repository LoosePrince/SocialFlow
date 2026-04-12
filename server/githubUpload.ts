import path from 'node:path';

const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN ?? '';
const GITHUB_USER = () => process.env.GITHUB_USER ?? '';
const GITHUB_REPO = () => process.env.GITHUB_REPO ?? '';
const GITHUB_UPLOAD_PATH = () => process.env.GITHUB_UPLOAD_PATH ?? 'SocialFlow/';
const GITHUB_EMAIL = () => process.env.GITHUB_EMAIL ?? '';

/** CRC-32 查表，输出 8 位小写十六进制（与常见「文件 CRC32」一致） */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32Hex(buffer: Buffer): string {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function uploadRootDir(): string {
  return GITHUB_UPLOAD_PATH().replace(/^\/+/, '').replace(/\/+$/, '');
}

/** 仓库内完整路径（含 SocialFlow/ 等前缀） */
function fullRepoPath(relativeUnderRoot: string): string {
  const root = uploadRootDir();
  const rel = relativeUnderRoot.replace(/^\/+/, '');
  return root ? `${root}/${rel}` : rel;
}

function extForFile(fileName: string, mime: string): string {
  const fromName = path.extname(path.basename(fileName || '')).toLowerCase();
  if (fromName && fromName.length >= 2 && fromName.length <= 12 && /^\.[a-z0-9.]+$/.test(fromName)) {
    return fromName;
  }
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/avif': '.avif',
    'image/bmp': '.bmp',
  };
  return map[mime.toLowerCase()] ?? '.bin';
}

async function getGithubBlobSha(
  owner: string,
  repo: string,
  token: string,
  filePath: string
): Promise<string | null> {
  const encoded = filePath
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `GitHub get content failed: ${res.status}`);
  }
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

export type UploadLayout = 'post' | 'project' | 'profile';

/**
 * 上传到 GitHub Contents，路径为 `{GITHUB_UPLOAD_PATH}{scope}/{contentId}/{crc32}{ext}`。
 * 同路径再次上传会带 sha 覆盖。返回写入数据库的相对路径（不含 GITHUB_UPLOAD_PATH 前缀）。
 */
export async function uploadBufferToGithub(
  buf: Buffer,
  layout: UploadLayout,
  contentId: string,
  originalFileName: string,
  mimeType: string
): Promise<string> {
  const user = GITHUB_USER();
  const repo = GITHUB_REPO();
  const token = GITHUB_TOKEN();
  if (!user || !repo || !token) {
    throw new Error('GitHub upload is not configured on server');
  }

  const ext = extForFile(originalFileName, mimeType);
  const hash = crc32Hex(buf);
  const relative = `${layout}/${contentId}/${hash}${ext}`;
  const filePath = fullRepoPath(relative);
  const base64 = buf.toString('base64');

  const sha = await getGithubBlobSha(user, repo, token, filePath);

  const encoded = filePath
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const url = `https://api.github.com/repos/${user}/${repo}/contents/${encoded}`;

  const body: Record<string, unknown> = {
    message: `upload ${layout}: ${relative}`,
    content: base64,
    branch: 'main',
    committer: {
      name: user,
      email: GITHUB_EMAIL() || 'noreply@github.com',
    },
  };
  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || 'GitHub upload failed');
  }

  return relative;
}
