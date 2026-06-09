import { useState, useEffect } from 'react';
import { apiJson } from '../lib/api';
import { getGithubUrl } from '../github';
import { subscribeAppEvents } from '../lib/appSse';

export const useFeeds = (showAll = false) => {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeeds = async () => {
    try {
      const params = showAll ? '?showAll=true' : '';
      const allData = await apiJson<Record<string, unknown>[]>(`/api/feeds${params}`);

      const processed = allData
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

      setFeeds(processed);
    } catch (err) {
      console.error('Fetch feeds error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchFeeds();
    const unsub = subscribeAppEvents((data) => {
      const t = data.table as string | undefined;
      if (t === 'posts' || t === 'projects') {
        void fetchFeeds();
      }
    });
    return () => unsub();
  }, [showAll]);

  return { feeds, loading };
};
