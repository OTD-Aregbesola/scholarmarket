import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query/queryKeys';
import { useBatchEntitlements, useEntitlement } from '../useEntitlements';
import { createTestQueryClient, createTestServer, createWrapper } from './helpers';

const { mockWallet } = vi.hoisted(() => ({
  mockWallet: { address: 'GCREATORTESTADDRESS', isConnected: true, balances: {} },
}));
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => mockWallet }));

const server = createTestServer();
const ADDRESS = 'GCREATORTESTADDRESS';

describe('useEntitlement (#147)', () => {
  it('loads entitlement data under the canonical query key', async () => {
    server.use(
      http.get('*/api/materials/access', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('materialId')).toBe('m1');
        expect(url.searchParams.get('buyerAddress')).toBe(ADDRESS);
        return HttpResponse.json({ hasAccess: true, source: 'purchase' });
      }),
    );

    const client = createTestQueryClient();
    const { result } = renderHook(() => useEntitlement('m1'), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.hasAccess).toBe(true);
    expect(client.getQueryData(queryKeys.purchases.entitlement('m1', ADDRESS))).toEqual(result.current.data);
  });

  it('exposes an error when the entitlement request fails', async () => {
    server.use(http.get('*/api/materials/access', () => HttpResponse.json({ detail: 'boom' }, { status: 500 })));
    const { result } = renderHook(() => useEntitlement('m1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.error.message).toMatch(/boom/);
  });

  it('does not fetch without a material id or wallet address', () => {
    mockWallet.address = null;
    try {
      const { result } = renderHook(() => useEntitlement('m1'), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    } finally {
      mockWallet.address = ADDRESS;
    }
  });
});

describe('useBatchEntitlements (#147)', () => {
  it('maps batch results into a lookup Map under the batch query key', async () => {
    server.use(http.post('*/api/entitlements/batch', () => HttpResponse.json({
      results: [
        { materialId: 'm1', hasAccess: true },
        { materialId: 'm2', hasAccess: false },
      ],
    })));

    const ids = ['m1', 'm2'];
    const client = createTestQueryClient();
    const { result } = renderHook(() => useBatchEntitlements(ids), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.get('m1')).toBe(true);
    expect(result.current.data.get('m2')).toBe(false);
    expect(client.getQueryData(['purchases', 'entitlements', 'batch', ids, ADDRESS])).toBe(result.current.data);
  });

  it('exposes an error for a failed batch request', async () => {
    server.use(http.post('*/api/entitlements/batch', () => HttpResponse.json({ detail: 'batch failed' }, { status: 503 })));
    const { result } = renderHook(() => useBatchEntitlements(['m1']), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
