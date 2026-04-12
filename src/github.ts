import { uploadMedia, type UploadScope } from './lib/api';

const GITHUB_USER = import.meta.env.VITE_GITHUB_USER;
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO;
const GITHUB_UPLOAD_PATH = import.meta.env.VITE_GITHUB_UPLOAD_PATH;

export type { UploadScope };

export function uploadToGithub(
  file: File,
  options: { scope: UploadScope; contentId: string }
): Promise<string> {
  return uploadMedia(file, options);
}

const DEFAULT_BRANCH = 'main';

function cdnPairFromRepoPath(
  user: string,
  repo: string,
  branch: string,
  pathInRepo: string
): { primary: string; fallback: string } {
  const path = pathInRepo.replace(/^\/+/, '');
  return {
    primary: `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${path}`,
    fallback: `https://cdn.jsdmirror.com/gh/${user}/${repo}@${branch}/${path}`,
  };
}

/**
 * 将任意已知的「仓库资源」输入统一为 jsDelivr（主）+ jsdmirror（备）。
 * 不使用 raw.githubusercontent.com 作为输出；若输入为 raw 或 github.com/blob|raw，会解析后转为 CDN。
 * 非 GitHub 托管的绝对 URL（如 Gravatar）原样返回。
 */
export function resolveGithubCdnUrls(input: string): { primary: string; fallback: string } {
  const s = input?.trim() ?? '';
  if (!s) return { primary: '', fallback: '' };

  if (s.startsWith('http://') || s.startsWith('https://')) {
    const pathOnly = s.split(/[?#]/)[0];

    const rawUserContent = pathOnly.match(
      /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i
    );
    if (rawUserContent) {
      const [, user, repo, branch, pathEncoded] = rawUserContent;
      const path = decodeURIComponent(pathEncoded.replace(/\+/g, ' '));
      return cdnPairFromRepoPath(user, repo, branch, path);
    }

    const ghBlob = pathOnly.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i);
    if (ghBlob) {
      const [, user, repo, branch, pathEncoded] = ghBlob;
      const path = decodeURIComponent(pathEncoded.replace(/\+/g, ' '));
      return cdnPairFromRepoPath(user, repo, branch, path);
    }

    const ghRawPath = pathOnly.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/i);
    if (ghRawPath) {
      const [, user, repo, branch, pathEncoded] = ghRawPath;
      const path = decodeURIComponent(pathEncoded.replace(/\+/g, ' '));
      return cdnPairFromRepoPath(user, repo, branch, path);
    }

    const jsd = pathOnly.match(/^https?:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@]+)@([^/]+)\/(.+)$/i);
    if (jsd) {
      const [, user, repo, branch, path] = jsd;
      return cdnPairFromRepoPath(user, repo, branch, path);
    }

    const jsdmirror = pathOnly.match(/^https?:\/\/cdn\.jsdmirror\.com\/gh\/([^/]+)\/([^@]+)@([^/]+)\/(.+)$/i);
    if (jsdmirror) {
      const [, user, repo, branch, path] = jsdmirror;
      return cdnPairFromRepoPath(user, repo, branch, path);
    }

    return { primary: s, fallback: s };
  }

  const user = GITHUB_USER || '';
  const repo = GITHUB_REPO || '';
  const base = (GITHUB_UPLOAD_PATH || '').replace(/^\/+/, '').replace(/\/$/, '');
  const rel = s.replace(/^\/+/, '');
  const path = base ? `${base}/${rel}` : rel;
  return cdnPairFromRepoPath(user, repo, DEFAULT_BRANCH, path);
}

/**
 * 展示用主 CDN URL（jsDelivr）。请始终通过本函数处理头像、封面、图床路径及历史里存过的 raw/blob 链接。
 */
export const getGithubUrl = (pathOrUrl: string) => resolveGithubCdnUrls(pathOrUrl).primary;
