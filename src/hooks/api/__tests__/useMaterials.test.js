import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  useCreateMaterial,
  useMarketplaceMaterials,
  useMaterialDetail,
  useUpdateMaterial,
} from '../useMaterials';
import { createTestQueryClient, createTestServer, createWrapper } from './helpers';

const server = createTestServer();

describe('useMarketplaceMaterials (#147)', () => {
  const params = { category: 'physics' };

  it('loads listings under the marketplace query key', async () => {
    server.use(http.get('*/api/market-materials', () => HttpResponse.json({ items: [{ id: 'm1' }], total: 1 })));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMarketplaceMaterials(params), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.items).toHaveLength(1);
    expect(client.getQueryData(queryKeys.materials.marketplace(params))).toEqual(result.current.data);
  });

  it('exposes an error response', async () => {
    server.use(http.get('*/api/market-materials', () => HttpResponse.json({ detail: 'unavailable' }, { status: 500 })));
    const { result } = renderHook(() => useMarketplaceMaterials(params), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
  });
});

describe('useMaterialDetail (#147)', () => {
  it('loads a single material and stays idle without an id', async () => {
    server.use(http.get('*/api/market-materials', () => HttpResponse.json({ _id: 'm1', title: 'Notes' })));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMaterialDetail('m1'), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.materials.detail('m1'))).toEqual(result.current.data);

    const idle = renderHook(() => useMaterialDetail(null), { wrapper: createWrapper() });
    expect(idle.result.current.fetchStatus).toBe('idle');
  });
});

describe('material mutations (#147)', () => {
  it('invalidates material and dashboard keys after creating a material', async () => {
    server.use(http.post('*/api/materials', () => HttpResponse.json({ success: true, _id: 'new' }, { status: 201 })));
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateMaterial(), { wrapper: createWrapper(client) });

    await act(async () => { await result.current.mutateAsync({ title: 'New' }); });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.materials.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['materials', 'marketplace'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all });
  });

  it('invalidates the same keys after updating a material', async () => {
    server.use(http.put('*/api/materials', () => HttpResponse.json({ success: true })));
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateMaterial(), { wrapper: createWrapper(client) });

    await act(async () => { await result.current.mutateAsync({ id: 'm1', data: { title: 'Updated' } }); });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.materials.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all });
  });

  it('surfaces mutation errors', async () => {
    server.use(http.post('*/api/materials', () => HttpResponse.json({ detail: 'bad payload' }, { status: 400 })));
    const { result } = renderHook(() => useCreateMaterial(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync({})).rejects.toThrow(/bad payload/);
    });
  });
});
