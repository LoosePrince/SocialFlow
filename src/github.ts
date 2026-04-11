const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
const GITHUB_USER = import.meta.env.VITE_GITHUB_USER;
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO;
const GITHUB_UPLOAD_PATH = import.meta.env.VITE_GITHUB_UPLOAD_PATH; // SocialFlow/
const GITHUB_EMAIL = import.meta.env.VITE_GITHUB_EMAIL;

export const uploadToGithub = async (file: File): Promise<string> => {
  const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const filePath = `${GITHUB_UPLOAD_PATH}${fileName}`;
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${filePath}`;

  // Read file as base64
  const base64Content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `upload image: ${fileName}`,
      content: base64Content,
      branch: 'main',
      committer: {
        name: GITHUB_USER,
        email: GITHUB_EMAIL,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'GitHub upload failed');
  }

  // Documentation: "数据库不直接储存链接而是储存相对SocialFlow路径的相对路径"
  // So we return the fileName or the relative path from GITHUB_UPLOAD_PATH
  return fileName;
};

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
 * 将相对路径、raw GitHub、jsDelivr、osyb 等地址统一为 jsDelivr（主）与 jsdmirror（备）。
 * 非上述 GitHub 资源的外链保持 primary === fallback。
 */
export function resolveGithubCdnUrls(input: string): { primary: string; fallback: string } {
  const s = input?.trim() ?? '';
  if (!s) return { primary: '', fallback: '' };

  if (s.startsWith('http://') || s.startsWith('https://')) {
    const raw = s.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
    if (raw) {
      const [, user, repo, branch, path] = raw;
      return cdnPairFromRepoPath(user, repo, branch, path);
    }
    const jsd = s.match(/^https?:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@]+)@([^/]+)\/(.+)$/i);
    if (jsd) {
      const [, user, repo, branch, path] = jsd;
      return cdnPairFromRepoPath(user, repo, branch, path);
    }
    const jsdmirror = s.match(/^https?:\/\/cdn\.jsdmirror\.com\/gh\/([^/]+)\/([^@]+)@([^/]+)\/(.+)$/i);
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

/** 展示用主 CDN（jsDelivr）；加载失败或超时请配合 useGithubCdnSrc / GithubCdnAvatar / GithubCdnImg */
export const getGithubUrl = (relativePath: string) => {
  if (!relativePath) return '';
  return resolveGithubCdnUrls(relativePath).primary;
};
