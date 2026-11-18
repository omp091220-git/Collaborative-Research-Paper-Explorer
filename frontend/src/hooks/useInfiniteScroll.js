import { useEffect, useRef } from 'react';

/**
 * Custom hook to trigger a callback when a sentinel element enters the viewport.
 *
 * @param {object} options
 * @param {Function} options.onIntersect - Callback invoked when sentinel is visible
 * @param {boolean} options.enabled - Whether the observer should be active
 * @param {string} [options.rootMargin='250px'] - Viewport margin to trigger early prefetch
 * @param {number} [options.threshold=0.1] - Visibility ratio required to trigger
 * @returns {React.RefObject} Ref to attach to the sentinel element
 */
export function useInfiniteScroll({
  onIntersect,
  enabled = true,
  rootMargin = '250px',
  threshold = 0.1,
}) {
  const sentinelRef = useRef(null);
  const callbackRef = useRef(onIntersect);

  useEffect(() => {
    callbackRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    const sentinelEl = sentinelRef.current;
    if (!sentinelEl || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && callbackRef.current) {
          callbackRef.current();
        }
      },
      {
        root: null,
        rootMargin,
        threshold,
      }
    );

    observer.observe(sentinelEl);

    return () => {
      observer.disconnect();
    };
  }, [enabled, rootMargin, threshold]);

  return sentinelRef;
}

export default useInfiniteScroll;
