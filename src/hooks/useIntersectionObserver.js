import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for observing element visibility using IntersectionObserver.
 * Calls onVisible when element enters viewport.
 *
 * @param {Function} onVisible - Callback when element becomes visible
 * @param {Object} options - IntersectionObserver options (threshold, rootMargin, etc.)
 * @returns {RefObject} Ref to attach to the element to observe
 */
export function useIntersectionObserver(onVisible, options = {}) {
  const elementRef = useRef(null);
  const observerRef = useRef(null);
  const hasBeenVisibleRef = useRef(false);

  const handleIntersection = useCallback((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !hasBeenVisibleRef.current && onVisible) {
        hasBeenVisibleRef.current = true;
        onVisible();
      }
    });
  }, [onVisible]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observerOptions = {
      threshold: 0.1,
      rootMargin: '50px',
      ...options,
    };

    observerRef.current = new IntersectionObserver(handleIntersection, observerOptions);
    observerRef.current.observe(element);

    return () => {
      if (observerRef.current && element) {
        observerRef.current.unobserve(element);
      }
    };
  }, [handleIntersection, options]);

  return elementRef;
}
