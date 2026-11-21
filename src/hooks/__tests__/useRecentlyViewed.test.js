import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installFailingStorage,
  resetLocalStorage,
} from '../../../test/helpers/hookTestHelpers';
import { trackRecentlyViewed, useRecentlyViewed } from '../useRecentlyViewed';

const STORAGE_KEY = 'scholarmarket.recentlyViewed';

const getMaterialDetail = vi.fn();
vi.mock('@/services/materialService', () => ({
  materialService: { getMaterialDetail: (...args) => getMaterialDetail(...args) },
}));

const queryWrapper = ({ children }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
    children,
  );

describe('useRecentlyViewed storage operations (#162)', () => {
  resetLocalStorage();

  beforeEach(() => getMaterialDetail.mockReset());

  const stored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');

  it('puts the most recently viewed material first', () => {
    trackRecentlyViewed({ _id: 'a' });
    trackRecentlyViewed({ _id: 'b' });
    expect(stored()).toEqual(['b', 'a']);
  });

  it('deduplicates a material already in the list', () => {
    trackRecentlyViewed({ _id: 'a' });
    trackRecentlyViewed({ _id: 'b' });
    trackRecentlyViewed({ materialId: 'a' });
    expect(stored()).toEqual(['a', 'b']);
  });

  it('caps the list at the maximum of twelve items', () => {
    for (let i = 0; i < 15; i += 1) trackRecentlyViewed({ id: `m${i}` });
    expect(stored()).toHaveLength(12);
    expect(stored()[0]).toBe('m14');
  });

  it('ignores materials without a usable id', () => {
    trackRecentlyViewed({ title: 'no id' });
    expect(stored()).toEqual([]);
  });

  it('returns stored ids and resolves the first six details', async () => {
    for (let i = 0; i < 8; i += 1) trackRecentlyViewed({ id: `m${i}` });
    getMaterialDetail.mockImplementation(async (id) => ({ id }));

    const { result } = renderHook(() => useRecentlyViewed(), { wrapper: queryWrapper });

    await waitFor(() => expect(result.current.items).toHaveLength(6));
    expect(result.current.ids).toHaveLength(8);
    expect(getMaterialDetail).toHaveBeenCalledTimes(6);
  });

  it('skips details that fail to load', async () => {
    trackRecentlyViewed({ id: 'ok' });
    trackRecentlyViewed({ id: 'broken' });
    getMaterialDetail.mockImplementation(async (id) => {
      if (id === 'broken') throw new Error('not found');
      return { id };
    });

    const { result } = renderHook(() => useRecentlyViewed(), { wrapper: queryWrapper });

    await waitFor(() => expect(result.current.items).toEqual([{ id: 'ok' }]));
  });
});

describe('useRecentlyViewed with unavailable storage (#162)', () => {
  installFailingStorage();

  it('does not throw when recording a view', () => {
    expect(() => trackRecentlyViewed({ _id: 'a' })).not.toThrow();
  });

  it('falls back to an empty list in the hook', async () => {
    const { result } = renderHook(() => useRecentlyViewed(), { wrapper: queryWrapper });
    expect(result.current.ids).toEqual([]);
    expect(result.current.items).toEqual([]);
    await act(async () => {});
  });
});
