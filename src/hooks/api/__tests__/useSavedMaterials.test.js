import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query/queryKeys';
import { useSavedMaterials } from '../useSavedMaterials';
import { createTestQueryClient, createTestServer, createWrapper, resetStorage } from './helpers';

const server = createTestServer();
const ADDRESS = 'GSAVEDTEST';
const STORAGE_KEY = `scholarmarket.savedMaterials.v1:${ADDRESS.toLowerCase()}`;

const { mockWallet } = vi.hoisted(() => ({
  mockWallet: { address: 'GSAVEDTEST', isConnected: true, balances: {} },
}));
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => mockWallet }));

describe('useSavedMaterials (#147)', () => {
  resetStorage();

  it('loads saved materials under the address-scoped query key', async () => {
    server.use(http.get('*/api/saved-materials', () => HttpResponse.json({
      items: [{ materialId: 'm1', material: { _id: 'm1', title: 'Saved' }, savedAt: '2026-11-20T00:00:00.000Z' }],
    })));

    const client = createTestQueryClient();
    const { result } = renderHook(() => useSavedMaterials(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.isSaved('m1')).toBe(true);
    expect(client.getQueryData(queryKeys.materials.saved(ADDRESS))).toEqual(result.current.items);
  });

  it('falls back to localStorage when the backend errors', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['m2']));
    server.use(http.get('*/api/saved-materials', () => HttpResponse.json({ detail: 'down' }, { status: 500 })));

    const { result } = renderHook(() => useSavedMaterials(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.items).toEqual(['m2']));
    expect(result.current.isSaved('m2')).toBe(true);
  });

  it('invalidates the saved query key after a successful toggle', async () => {
    server.use(
      http.get('*/api/saved-materials', () => HttpResponse.json({ items: [] })),
      http.post('*/api/saved-materials', () => HttpResponse.json({ success: true }, { status: 201 })),
    );
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSavedMaterials(), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => { await result.current.toggleSavedAsync({ _id: 'm3' }); });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.materials.saved(ADDRESS) });
  });

  it('rolls a failed save back to localStorage without losing state', async () => {
    server.use(
      http.get('*/api/saved-materials', () => HttpResponse.json({ items: [] })),
      http.post('*/api/saved-materials', () => HttpResponse.json({ detail: 'failed' }, { status: 500 })),
    );
    const { result } = renderHook(() => useSavedMaterials(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.items).toEqual([]));

    const outcome = await act(async () => result.current.toggleSavedAsync({ _id: 'm4' }));

    expect(outcome).toMatchObject({ id: 'm4', saved: true });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(['m4']);
    expect(result.current.toggleError).toBeNull();
  });

  it('rejects a toggle when no wallet is connected', async () => {
    mockWallet.address = null;
    mockWallet.isConnected = false;
    try {
      const { result } = renderHook(() => useSavedMaterials(), { wrapper: createWrapper() });
      await act(async () => {
        await expect(result.current.toggleSavedAsync({ _id: 'm5' })).rejects.toThrow(/Connect your wallet/);
      });
    } finally {
      mockWallet.address = ADDRESS;
      mockWallet.isConnected = true;
    }
  });
});
