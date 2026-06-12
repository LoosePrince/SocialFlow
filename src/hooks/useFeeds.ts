import { useMemo, useState, useEffect, useCallback } from 'react';
import { apiJson, onApiCacheUpdate } from '../lib/api';
import { getGithubUrl } from '../github';
import { subscribeAppEvents } from '../lib/appSse';

export type UseFeedsOptions = {
  showAll?: boolean;
  authorId?: string;
  /** 为 false 时不发请求（如个人页尚未解析出 userId） */
  enabled?: boolean;
};

function normalizeFeeds(allData: Record<string, unknown>[]) {
  return allData
    .map((item) => {
      const coverurl = item.coverurl ? getGithubUrl(String(item.coverurl)) : '';
      const images = item.images
        ? (item.images as string[]).map(getGithubUrl)
        : [];
      const authorPhoto = (item.profiles as { photourl?: string } | undefined)?.photourl || '';

      return {
        ...item,
        coverurl,
        images,
        fileattachments: Array.isArray(item.fileattachments) ? item.fileattachments : [],
        authorName: (item.profiles as { displayname?: string } | undefined)?.displayname,
        authorPhoto: getGithubUrl(authorPhoto),
        createdAt: item.createdat,
        likeCount: item.likecount,
        commentCount: item.commentcount,
        isRecommended: item.isrecommended,
      };
    })
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      Number(b.createdat ?? b.createdAt) - Number(a.createdat ?? a.createdAt)
    );
}

function buildFeedsPath(options: UseFeedsOptions): string {
  const params = new URLSearchParams();
  if (options.showAll) params.set('showAll', 'true');
  const authorId = options.authorId?.trim();
  if (authorId) params.set('authorId', authorId);
  const q = params.toString();
  return q ? `/api/feeds?${q}` : '/api/feeds';
}

export const useFeeds = (options: boolean | UseFeedsOptions = false) => {
  const resolved = typeof options === 'boolean' ? { showAll: options } : options;
  const showAll = resolved.showAll ?? false;
  const authorId = resolved.authorId?.trim() || undefined;
  const enabled = resolved.enabled ?? true;
  const path = useMemo(
    () => buildFeedsPath({ showAll, authorId }),
    [showAll, authorId]
  );

  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeeds = useCallback(async () => {
    try {
      const allData = await apiJson<Record<string, unknown>[]>(path);
      setFeeds(normalizeFeeds(allData));
    } catch (err) {
      console.error('Fetch feeds error:', err);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (!enabled) {
      setFeeds([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void fetchFeeds();
    const unsubCache = onApiCacheUpdate<Record<string, unknown>[]>(path, (allData) => {
      setFeeds(normalizeFeeds(allData));
      setLoading(false);
    });
    const unsub = subscribeAppEvents((data) => {
      const t = data.table as string | undefined;
      if (t === 'posts' || t === 'projects') {
        void fetchFeeds();
      }
    });
    return () => {
      unsubCache();
      unsub();
    };
  }, [enabled, fetchFeeds, path]);

  return { feeds, loading };
};
