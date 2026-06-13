import { useEffect, useRef } from 'react';

type UseInfiniteScrollOptions = {
  disabled?: boolean;
  loading?: boolean;
  hasMore?: boolean;
  rootMargin?: string;
  onLoadMore: () => void;
};

export function useInfiniteScroll({
  disabled = false,
  loading = false,
  hasMore = true,
  rootMargin = '320px 0px',
  onLoadMore,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || disabled || loading || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onLoadMoreRef.current();
        }
      },
      { root: null, rootMargin, threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled, loading, hasMore, rootMargin]);

  return sentinelRef;
}