import { useState, useEffect } from 'react';
import { apiJson, onApiCacheUpdate } from '../lib/api';
import { getGithubUrl } from '../github';
import { subscribeAppEvents } from '../lib/appSse';

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

export const useFeeds = (showAll = false) => {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const path = showAll ? '/api/feeds?showAll=true' : '/api/feeds';

  const fetchFeeds = async () => {
    try {
      const allData = await apiJson<Record<string, unknown>[]>(path);
      setFeeds(normalizeFeeds(allData));
    } catch (err) {
      console.error('Fetch feeds error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
  }, [showAll]);

  return { feeds, loading };
};
