import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query/queryKeys';
import { useTopCreators, useUpdateProfile, useUserProfile } from '../useProfile';
import { createTestQueryClient, createTestServer, createWrapper } from './helpers';

const server = createTestServer();
const ADDRESS = 'GPROFILETEST';

describe('useUserProfile (#147)', () => {
  it('loads a profile under the detail query key', async () => {
    server.use(http.get('*/api/profile', () => HttpResponse.json({ walletAddress: ADDRESS, name: 'Ada' })));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useUserProfile(ADDRESS), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.profile.detail(ADDRESS))).toEqual(result.current.data);
  });

  it('exposes an error for a failed profile request', async () => {
    server.use(http.get('*/api/profile', () => HttpResponse.json({ detail: 'missing' }, { status: 404 })));
    const { result } = renderHook(() => useUserProfile(ADDRESS), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useTopCreators (#147)', () => {
  it('loads the leaderboard under the top query key', async () => {
    server.use(http.get('*/api/creators/top', () => HttpResponse.json([{ walletAddress: ADDRESS }])));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useTopCreators(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.profile.top())).toEqual(result.current.data);
  });
});

describe('useUpdateProfile (#147)', () => {
  it('invalidates the updated address detail key on success', async () => {
    server.use(http.patch('*/api/profile', () => HttpResponse.json({ user: { walletAddress: ADDRESS } })));
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper(client) });

    await act(async () => { await result.current.mutateAsync({ name: 'Grace' }); });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.profile.detail(ADDRESS) });
  });

  it('surfaces mutation errors', async () => {
    server.use(http.patch('*/api/profile', () => HttpResponse.json({ detail: 'invalid' }, { status: 400 })));
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync({ name: '' })).rejects.toThrow(/invalid/);
    });
  });
});
