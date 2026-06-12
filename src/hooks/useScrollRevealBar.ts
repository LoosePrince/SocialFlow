import { useEffect, useRef, useState } from 'react';

const SCROLL_DELTA = 6;
const TOP_REVEAL_Y = 12;

/** 向下滚动隐藏、向上滚动显示（用于详情页顶栏） */
export function useScrollRevealBar(enabled: boolean): boolean {
  const [visible, setVisible] = useState(true);
  const lastYRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return undefined;
    }

    lastYRef.current = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastYRef.current;

      if (y <= TOP_REVEAL_Y) {
        setVisible(true);
      } else if (delta > SCROLL_DELTA) {
        setVisible(false);
      } else if (delta < -SCROLL_DELTA) {
        setVisible(true);
      }

      lastYRef.current = y;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled]);

  return visible;
}
