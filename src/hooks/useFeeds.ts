import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { apiJson, onApiCacheUpdate } from '../lib/api';
import { getGithubUrl } from '../github';
import { subscribeAppEvents } from '../lib/appSse';

export type FeedType = 'all' | 'post' | 'project';

export type UseFeedsOptions = {
  showAll?: boolean;
  authorId?: string;
  type?: FeedType;
  pageSize?: number;
  /** 为 false 时不发请求（如个人页尚未解析出 userId） */
  enabled?: boolean;
};

type PaginatedResponse<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
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
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const delta = Number(b.createdat ?? b.createdAt) - Number(a.createdat ?? a.createdAt);
      if (delta !== 0) return delta;
      return String(b.id ?? '').localeCompare(String(a.id ?? ''));
    });
}

function mergeFeeds(current: any[], incoming: any[], mode: 'replace' | 'prepend' | 'append') {
  const source =
    mode === 'replace'
      ? incoming
      : mode === 'prepend'
        ? [...incoming, ...current]
        : [...current, ...incoming];
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const item of source) {
    const key = `${item.type ?? 'item'}:${item.id}`;
    if (!item.id || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return normalizeFeeds(deduped);
}

function buildFeedsPath(options: UseFeedsOptions & { cursor?: string | null }): string {
  const params = new URLSearchParams();
  if (options.showAll) params.set('showAll', 'true');
  const authorId = options.authorId?.trim();
  if (authorId) params.set('authorId', authorId);
  params.set('type', options.type ?? 'all');
  params.set('limit', String(options.pageSize ?? 20));
  if (options.cursor) params.set('cursor', options.cursor);
  return `/api/feeds?${params.toString()}`;
}

export const useFeeds = (options: boolean | UseFeedsOptions = false) => {
  const resolved = typeof options === 'boolean' ? { showAll: options } : options;
  const showAll = resolved.showAll ?? false;
  const authorId = resolved.authorId?.trim() || undefined;
  const enabled = resolved.enabled ?? true;
  const type = resolved.type ?? 'all';
  const pageSize = resolved.pageSize ?? 20;
  const firstPagePath = useMemo(
    () => buildFeedsPath({ showAll, authorId, type, pageSize }),
    [showAll, authorId, type, pageSize]
  );

  const requestSeq = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadedPastFirstRef = useRef(false);
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const fetchPage = useCallback(async (cursor: string | null, mode: 'replace' | 'prepend' | 'append') => {
    const path = buildFeedsPath({ showAll, authorId, type, pageSize, cursor });
    const data = await apiJson<PaginatedResponse<Record<string, unknown>>>(path, {
      localFirst: mode !== 'append',
    });
    const items = normalizeFeeds(data.items ?? []);
    setFeeds((current) => mergeFeeds(current, items, mode));
    if (mode === 'append') {
      loadedPastFirstRef.current = true;
      setNextCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } else if (mode === 'replace') {
      loadedPastFirstRef.current = false;
      setNextCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } else if (!loadedPastFirstRef.current) {
      setNextCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    }
    return data;
  }, [authorId, pageSize, showAll, type]);

  const refresh = useCallback(async () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setError(null);
    try {
      await fetchPage(null, 'replace');
    } catch (err) {
      if (requestSeq.current === seq) {
        setError(err);
        setFeeds([]);
        setHasMore(false);
        setNextCursor(null);
      }
      console.error('Fetch feeds error:', err);
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!enabled || loadingMoreRef.current || loading || !hasMore || !nextCursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      await fetchPage(nextCursor, 'append');
    } catch (err) {
      setError(err);
      console.error('Fetch more feeds error:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [enabled, fetchPage, hasMore, loading, nextCursor]);

  useEffect(() => {
    if (!enabled) {
      requestSeq.current += 1;
      setFeeds([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      setNextCursor(null);
      setError(null);
      return;
    }

    void refresh();
    const unsubCache = onApiCacheUpdate<PaginatedResponse<Record<string, unknown>>>(firstPagePath, (data) => {
      setFeeds((current) => mergeFeeds(current, normalizeFeeds(data.items ?? []), 'prepend'));
      if (!loadedPastFirstRef.current) {
        setNextCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.hasMore));
      }
      setLoading(false);
    });
    const unsub = subscribeAppEvents((data) => {
      const t = data.table as string | undefined;
      if (t === 'posts' || t === 'projects') {
        void fetchPage(null, 'prepend').catch((err) => console.debug('[feeds] refresh failed:', err));
      }
    });
    return () => {
      unsubCache();
      unsub();
    };
  }, [enabled, fetchPage, firstPagePath, refresh]);

  return { feeds, loading, loadingMore, hasMore, loadMore, refresh, error };
};