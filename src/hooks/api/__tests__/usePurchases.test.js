import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query/queryKeys';
import { useCheckEntitlement, useCreatePurchase, usePurchaseHistory } from '../usePurchases';
import { createTestQueryClient, createTestServer, createWrapper } from './helpers';

const server = createTestServer();
const ADDRESS = 'GBUYERTEST';

describe('usePurchaseHistory (#147)', () => {
  it('loads history under the history query key', async () => {
    server.use(http.get('*/api/purchase', () => HttpResponse.json([{ id: 'p1' }])));
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePurchaseHistory(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.purchases.history())).toEqual(result.current.data);
  });

  it('exposes an error response', async () => {
    server.use(http.get('*/api/purchase', () => HttpResponse.json({ detail: 'denied' }, { status: 403 })));
    const { result } = renderHook(() => usePurchaseHistory(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useCheckEntitlement (#147)', () => {
  it('loads entitlement under the canonical key', async () => {
    server.use(http.get('*/api/materials/access', () => HttpResponse.json({ hasAccess: true })));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useCheckEntitlement('m1', ADDRESS), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.purchases.entitlement('m1', ADDRESS))).toEqual(result.current.data);
  });
});

describe('useCreatePurchase (#147)', () => {
  it('invalidates all purchase queries and the matching entitlement key', async () => {
    server.use(http.post('*/api/purchase', () => HttpResponse.json({ success: true }, { status: 201 })));
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreatePurchase(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({ materialId: 'm1', buyerAddress: ADDRESS });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.purchases.all });
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ predicate: expect.any(Function) }));
  });

  it('surfaces mutation errors', async () => {
    server.use(http.post('*/api/purchase', () => HttpResponse.json({ detail: 'chain failed' }, { status: 502 })));
    const { result } = renderHook(() => useCreatePurchase(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync({ materialId: 'm1' })).rejects.toThrow(/chain failed/);
    });
  });
});
