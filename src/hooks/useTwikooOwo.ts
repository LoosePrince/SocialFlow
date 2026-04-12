import { useEffect, useState } from 'react';
import {
  ensureTwikooOwoLoaded,
  getTwikooOwoIcon,
  getTwikooOwoItems,
  getTwikooOwoPacks,
  isTwikooOwoReady,
  type TwikooOwoItem,
  type TwikooOwoPack,
} from '../lib/twikooOwo';

export function useTwikooOwo() {
  const [ready, setReady] = useState(isTwikooOwoReady);
  const [items, setItems] = useState<TwikooOwoItem[]>(() => getTwikooOwoItems());
  const [packs, setPacks] = useState<TwikooOwoPack[]>(() => getTwikooOwoPacks());
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    void ensureTwikooOwoLoaded()
      .then(() => {
        if (cancelled) return;
        setItems(getTwikooOwoItems());
        setPacks(getTwikooOwoPacks());
        setReady(true);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ready,
    error,
    items,
    packs,
    getIcon: (text: string) => getTwikooOwoIcon(text),
  };
}
