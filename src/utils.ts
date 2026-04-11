import { apiJson } from './lib/api';

/**
 * 点赞 / 取消赞（经后端 API，用户身份由 JWT 决定）。
 */
export const toggleLike = async (contentId: string, contentType: 'post' | 'project') => {
  await apiJson<{ liked: boolean }>('/api/likes/toggle', {
    method: 'POST',
    body: JSON.stringify({ contentId, contentType }),
  });
};
