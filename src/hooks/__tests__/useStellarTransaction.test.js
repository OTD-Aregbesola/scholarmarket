import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStellarTransaction, TxStatus } from '../useStellarTransaction';

const { mockSignTransaction } = vi.hoisted(() => ({
  mockSignTransaction: vi.fn(),
}));

vi.mock('@/hooks/useWallet', () => ({
  useWallet: vi.fn(() => ({
    signTransaction: mockSignTransaction,
    isConnected: true,
  })),
}));

vi.mock('@/lib/transactions/transaction', () => ({
  classifyTransactionError: (err) => {
    const msg = err?.message ?? String(err);
    const isRetryable = /timeout|temporarily unavailable|try again/i.test(msg);
    return {
      status: isRetryable ? 'needs_retry' : 'failed',
    };
  },
  TransactionStatus: {
    NeedsRetry: 'needs_retry',
  },
}));

global.fetch = vi.fn();

describe('useStellarTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockClear();
  });

  describe('state machine transitions', () => {
    it('transitions from idle → signing → submitting → pending → success', async () => {
      const { result } = renderHook(() => useStellarTransaction());

      expect(result.current.state.status).toBe(TxStatus.Idle);

      const unsignedXdr = 'AAAAAA...';
      const signedXdr = 'AAAAAB...signed';
      const txHash = 'abc123def456';

      mockSignTransaction.mockResolvedValueOnce(signedXdr);

      global.fetch
        .mockResolvedValueOnce({
          json: async () => ({
            result: { hash: txHash, status: 'PENDING' },
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            result: { status: 'SUCCESS', resultXdr: 'result_xdr_data' },
          }),
        });

      const executePromise = act(async () => {
        await result.current.execute(unsignedXdr);
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe(TxStatus.Signing);
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe(TxStatus.Submitting);
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe(TxStatus.PendingConfirmation);
      });

      await executePromise;

      await waitFor(() => {
        expect(result.current.state.status).toBe(TxStatus.Success);
        expect(result.current.state.hash).toBe(txHash);
      });
    });

    it('transitions to error on wallet rejection during signing', async () => {
      const { result } = renderHook(() => useStellarTransaction());

      const unsignedXdr = 'AAAAAA...';
      const rejectionError = new Error('User rejected the transaction');

      mockSignTransaction.mockRejectedValueOnce(rejectionError);

      await act(async () => {
        try {
          await result.current.execute(unsignedXdr);
        } catch {
          // expected
        }
      });

      expect(result.current.state.status).toBe(TxStatus.Error);
      expect(result.current.state.error?.message).toBe('User rejected the transaction');
    });

    it('transitions to needs_retry on wallet dismissal', async () => {
      const { result } = renderHook(() => useStellarTransaction());

      const unsignedXdr = 'AAAAAA...';
      const dismissError = new Error('User cancelled the signing dialog');

      mockSignTransaction.mockRejectedValueOnce(dismissError);

      await act(async () => {
        try {
          await result.current.execute(unsignedXdr);
        } catch {
          // expected
        }
      });

      expect(result.current.state.status).toBe(TxStatus.NeedsRetry);
    });

    it('handles Horizon transaction failure with error result codes', async () => {
      const { result } = renderHook(() => useStellarTransaction());

      const unsignedXdr = 'AAAAAA...';
      const signedXdr = 'AAAAAB...signed';

      mockSignTransaction.mockResolvedValueOnce(signedXdr);

      global.fetch.mockResolvedValueOnce({
        json: async () => ({
          result: {
            hash: 'tx_hash',
            status: 'ERROR',
            errorResultXdr: 'error_code_tx_failed',
          },
        }),
      });

      await act(async () => {
        try {
          await result.current.execute(unsignedXdr);
        } catch {
          // expected
        }
      });

      expect(result.current.state.status).toBe(TxStatus.Error);
      expect(result.current.state.error?.message).toContain('rejected');
    });

    it('transitions to error on polling timeout', async () => {
      const { result } = renderHook(() => useStellarTransaction());

      const unsignedXdr = 'AAAAAA...';
      const signedXdr = 'AAAAAB...signed';
      const txHash = 'abc123def456';

      mockSignTransaction.mockResolvedValueOnce(signedXdr);

      global.fetch
        .mockResolvedValueOnce({
          json: async () => ({
            result: { hash: txHash, status: 'PENDING' },
          }),
        })
        .mockImplementation(async () => ({
          json: async () => ({ error: null }),
        }));

      await act(async () => {
        try {
          await result.current.execute(unsignedXdr, { description: 'Test TX' });
        } catch {
          // expected
        }
      });

      expect(result.current.state.status).toBe(TxStatus.Error);
      expect(result.current.state.error?.message).toContain('timeout');
    });
  });

  describe('reset behavior', () => {
    it('resets state from success back to idle', async () => {
      const { result } = renderHook(() => useStellarTransaction());

      const unsignedXdr = 'AAAAAA...';
      const signedXdr = 'AAAAAB...signed';
      const txHash = 'abc123def456';

      mockSignTransaction.mockResolvedValueOnce(signedXdr);

      global.fetch
        .mockResolvedValueOnce({
          json: async () => ({
            result: { hash: txHash, status: 'PENDING' },
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            result: { status: 'SUCCESS', resultXdr: 'result' },
          }),
        });

      await act(async () => {
        await result.current.execute(unsignedXdr);
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe(TxStatus.Success);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.status).toBe(TxStatus.Idle);
    });
  });

  describe('no wallet connection', () => {
    it('handles execution when wallet is disconnected', async () => {
      const { useWallet: originalUseWallet } = await import('@/hooks/useWallet');
      vi.mocked(originalUseWallet).mockReturnValueOnce({
        signTransaction: mockSignTransaction,
        isConnected: false,
      });

      const { result } = renderHook(() => useStellarTransaction());

      const unsignedXdr = 'AAAAAA...';

      await act(async () => {
        try {
          await result.current.execute(unsignedXdr);
        } catch {
          // expected
        }
      });

      expect(result.current.state.status).toBe(TxStatus.WaitingWallet);
      expect(result.current.state.error?.message).toContain('Wallet not connected');
    });
  });

  describe('description passing', () => {
    it('preserves description through state transitions', async () => {
      const { result } = renderHook(() => useStellarTransaction());

      const unsignedXdr = 'AAAAAA...';
      const signedXdr = 'AAAAAB...signed';
      const txHash = 'abc123def456';
      const description = 'Purchase Materials';

      mockSignTransaction.mockResolvedValueOnce(signedXdr);

      global.fetch
        .mockResolvedValueOnce({
          json: async () => ({
            result: { hash: txHash, status: 'PENDING' },
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            result: { status: 'SUCCESS', resultXdr: 'result' },
          }),
        });

      await act(async () => {
        await result.current.execute(unsignedXdr, { description });
      });

      expect(result.current.state.description).toBe(description);
    });
  });
});
