import { useEffect, useEffectEvent, useState } from "react";

/**
 * Calls onReach when the element the returned ref is set on scrolls into view, while enabled.
 * The browser's IntersectionObserver is what is synced with. Each time enabled turns on again,
 * the element is observed afresh, so it fires again if it is still in view.
 */
export function useReachEnd(onReach: () => void, enabled: boolean) {
  const [end, setEnd] = useState<Element | null>(null);
  const reached = useEffectEvent(onReach);

  useEffect(() => {
    if (end === null || !enabled) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        reached();
      }
    });
    observer.observe(end);
    return () => {
      observer.disconnect();
    };
  }, [end, enabled]);

  return setEnd;
}
