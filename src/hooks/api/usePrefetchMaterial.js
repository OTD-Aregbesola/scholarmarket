import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { materialService } from '@/services/materialService';
import { queryKeys } from '@/lib/query/queryKeys';

const MAX_CONCURRENT_PREFETCHES = 3;
let activePrefetches = 0;

/**
 * Hook for prefetching material detail data with concurrency control.
 * Respects user's connection speed (saveData setting).
 *
 * @returns {object} Object with prefetch methods for hover and viewport visibility.
 */
export function usePrefetchMaterial() {
  const queryClient = useQueryClient();
  const prefetchQueue = useRef([]);
  const prefetchedIds = useRef(new Set());

  const shouldPrefetch = useCallback(() => {
    if (typeof navigator === 'undefined') return true;

    const connection = navigator.connection;
    if (!connection) return true;

    // Skip prefetch on slow connections or if user has saveData enabled
    return !connection.saveData && connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g';
  }, []);

  const processPrefetchQueue = useCallback(async () => {
    if (activePrefetches >= MAX_CONCURRENT_PREFETCHES || prefetchQueue.current.length === 0) {
      return;
    }

    activePrefetches++;
    const materialId = prefetchQueue.current.shift();

    try {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.materials.detail(materialId),
        queryFn: () => materialService.getMaterialDetail(materialId),
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    } catch (error) {
      console.debug(`Failed to prefetch material ${materialId}:`, error);
    } finally {
      activePrefetches--;
      processPrefetchQueue();
    }
  }, [queryClient]);

  const queuePrefetch = useCallback((materialId) => {
    if (!shouldPrefetch() || prefetchedIds.current.has(materialId)) {
      return;
    }

    prefetchedIds.current.add(materialId);
    prefetchQueue.current.push(materialId);
    processPrefetchQueue();
  }, [shouldPrefetch, processPrefetchQueue]);

  const prefetchOnHover = useCallback((materialId) => {
    queuePrefetch(materialId);
  }, [queuePrefetch]);

  const prefetchOnVisible = useCallback((materialId) => {
    // Add a small delay to avoid prefetching on initial render
    const timer = setTimeout(() => {
      queuePrefetch(materialId);
    }, 100);

    return () => clearTimeout(timer);
  }, [queuePrefetch]);

  return {
    prefetchOnHover,
    prefetchOnVisible,
  };
}
