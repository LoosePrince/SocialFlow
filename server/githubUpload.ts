const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN ?? '';
const GITHUB_USER = () => process.env.GITHUB_USER ?? '';
const GITHUB_REPO = () => process.env.GITHUB_REPO ?? '';
const GITHUB_UPLOAD_PATH = () => process.env.GITHUB_UPLOAD_PATH ?? 'SocialFlow/';
const GITHUB_EMAIL = () => process.env.GITHUB_EMAIL ?? '';

export async function uploadBufferToGithub(fileName: string, base64Content: string): Promise<string> {
  const user = GITHUB_USER();
  const repo = GITHUB_REPO();
  const token = GITHUB_TOKEN();
  if (!user || !repo || !token) {
    throw new Error('GitHub upload is not configured on server');
  }
  const filePath = `${GITHUB_UPLOAD_PATH()}${fileName}`;
  const url = `https://api.github.com/repos/${user}/${repo}/contents/${filePath}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `upload image: ${fileName}`,
      content: base64Content,
      branch: 'main',
      committer: {
        name: user,
        email: GITHUB_EMAIL() || 'noreply@github.com',
      },
    }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || 'GitHub upload failed');
  }

  return fileName;
}
