import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveGithubCdnUrls } from '../github';

const DEFAULT_TIMEOUT_MS = 12_000;

export function useGithubCdnSrc(
  input: string | undefined,
  options?: { timeoutMs?: number }
): {
  src: string;
  onLoad: React.ReactEventHandler<HTMLImageElement>;
  onError: React.ReactEventHandler<HTMLImageElement>;
  /** 供 Ant Design Avatar onError 使用：无参数，返回 boolean */
  avatarOnError: () => boolean;
} {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { primary, fallback } = useMemo(() => resolveGithubCdnUrls(input ?? ''), [input]);
  const [src, setSrc] = useState(primary);
  const loadedRef = useRef(false);
  const triedFallbackRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    loadedRef.current = false;
    triedFallbackRef.current = false;
    setSrc(primary);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (!primary || primary === fallback) return;

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = undefined;
      if (!loadedRef.current && !triedFallbackRef.current) {
        triedFallbackRef.current = true;
        setSrc(fallback);
      }
    }, timeoutMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [primary, fallback, timeoutMs]);

  const onLoad = useCallback(() => {
    loadedRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const tryFallbackFromError = useCallback(() => {
    if (triedFallbackRef.current) return false;
    if (!primary || !fallback || primary === fallback) return false;
    if (src !== primary) return false;
    triedFallbackRef.current = true;
    setSrc(fallback);
    return true;
  }, [src, primary, fallback]);

  const onError = useCallback(() => {
    tryFallbackFromError();
  }, [tryFallbackFromError]);

  /** Ant Design Avatar：返回 false 表示暂不启用默认占位，便于切到备用 CDN */
  const avatarOnError = useCallback((): boolean => {
    return tryFallbackFromError() ? false : true;
  }, [tryFallbackFromError]);

  return { src, onLoad, onError, avatarOnError };
}
