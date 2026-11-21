import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCart } from '../useCart';
import { CartProvider } from '@/providers/CartProvider';
import { ReactNode } from 'react';

const mockToast = {
  show: vi.fn((config) => `toast_${Date.now()}`),
  update: vi.fn(),
};

vi.mock('@/hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({
    isConnected: true,
    address: 'GBW7ECQFYB5TQRWJFYMGR3M7DGMXVR3MNXLBDBKVCMZVB7YNIPNXDRG',
  }),
}));

vi.mock('@/services/purchaseService', () => ({
  purchaseService: {
    createPurchase: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('@/lib/config/chain', () => ({
  isMainnet: false,
}));

function createWrapper() {
  return function Wrapper({ children }) {
    return <CartProvider>{children}</CartProvider>;
  };
}

describe('useCart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('add to cart', () => {
    it('adds an item to the cart', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = {
        _id: '1',
        title: 'Test Material',
        price: 10.5,
        author: 'Test Author',
      };

      act(() => {
        result.current.addToCart(item);
      });

      expect(result.current.cartItems).toHaveLength(1);
      expect(result.current.cartItems[0]).toEqual(item);
    });

    it('shows success toast when item added', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = { _id: '1', title: 'Test Material', price: 10 };

      act(() => {
        result.current.addToCart(item);
      });

      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Added to Cart',
        })
      );
    });

    it('prevents duplicate items in cart', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = { _id: '1', title: 'Test Material', price: 10 };

      act(() => {
        result.current.addToCart(item);
      });

      expect(result.current.cartItems).toHaveLength(1);

      act(() => {
        result.current.addToCart(item);
      });

      expect(result.current.cartItems).toHaveLength(1);
      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          title: 'Already in Cart',
        })
      );
    });

    it('handles items with id field instead of _id', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = { id: 'uuid-123', title: 'Test', price: 5 };

      act(() => {
        result.current.addToCart(item);
      });

      expect(result.current.cartItems).toHaveLength(1);
      expect(result.current.cartItems[0]).toEqual(item);
    });
  });

  describe('remove from cart', () => {
    it('removes an item by _id', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = { _id: '1', title: 'Item', price: 10 };

      act(() => {
        result.current.addToCart(item);
      });

      expect(result.current.cartItems).toHaveLength(1);

      act(() => {
        result.current.removeFromCart('1');
      });

      expect(result.current.cartItems).toHaveLength(0);
    });

    it('removes an item by id', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = { id: 'uuid-456', title: 'Item', price: 15 };

      act(() => {
        result.current.addToCart(item);
      });

      act(() => {
        result.current.removeFromCart('uuid-456');
      });

      expect(result.current.cartItems).toHaveLength(0);
    });

    it('shows toast when item removed', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = { _id: '1', title: 'Item to Remove', price: 20 };

      act(() => {
        result.current.addToCart(item);
      });

      mockToast.show.mockClear();

      act(() => {
        result.current.removeFromCart('1');
      });

      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          title: 'Removed from Cart',
        })
      );
    });
  });

  describe('clear cart', () => {
    it('clears all items from the cart', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const items = [
        { _id: '1', title: 'Item 1', price: 5 },
        { _id: '2', title: 'Item 2', price: 10 },
        { _id: '3', title: 'Item 3', price: 15 },
      ];

      act(() => {
        items.forEach((item) => result.current.addToCart(item));
      });

      expect(result.current.cartItems).toHaveLength(3);

      act(() => {
        result.current.clearCart();
      });

      expect(result.current.cartItems).toHaveLength(0);
    });
  });

  describe('totals calculation', () => {
    it('calculates correct subtotal for single item', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = { _id: '1', title: 'Item', price: 10 };

      act(() => {
        result.current.addToCart(item);
      });

      expect(result.current.totals.subtotal).toBe(10);
    });

    it('calculates correct subtotal for multiple items', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const items = [
        { _id: '1', title: 'Item 1', price: 5.5 },
        { _id: '2', title: 'Item 2', price: 10.25 },
        { _id: '3', title: 'Item 3', price: 7.75 },
      ];

      act(() => {
        items.forEach((item) => result.current.addToCart(item));
      });

      expect(result.current.totals.subtotal).toBe(23.5);
    });

    it('includes estimated transaction fee', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = { _id: '1', title: 'Item', price: 10 };

      act(() => {
        result.current.addToCart(item);
      });

      expect(result.current.totals.estimatedFees).toBe(0.01);
    });

    it('calculates correct grand total', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = { _id: '1', title: 'Item', price: 10 };

      act(() => {
        result.current.addToCart(item);
      });

      expect(result.current.totals.grandTotal).toBe(10.01);
    });

    it('calculates creator split (90%) and platform split (10%)', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const item = { _id: '1', title: 'Item', price: 100 };

      act(() => {
        result.current.addToCart(item);
      });

      expect(result.current.totals.creatorSplit).toBe(90);
      expect(result.current.totals.platformSplit).toBe(10);
    });

    it('handles mixed decimal prices', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      const items = [
        { _id: '1', title: 'Item 1', price: 5.99 },
        { _id: '2', title: 'Item 2', price: 2.49 },
      ];

      act(() => {
        items.forEach((item) => result.current.addToCart(item));
      });

      const expectedSubtotal = 8.48;
      expect(result.current.totals.subtotal).toBeCloseTo(expectedSubtotal, 1);
    });
  });

  describe('cart open/close', () => {
    it('toggles cart open state', () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      expect(result.current.isCartOpen).toBe(false);

      act(() => {
        result.current.setIsCartOpen(true);
      });

      expect(result.current.isCartOpen).toBe(true);

      act(() => {
        result.current.setIsCartOpen(false);
      });

      expect(result.current.isCartOpen).toBe(false);
    });
  });

  describe('error handling', () => {
    it('throws error when useCart is used outside provider', () => {
      expect(() => {
        renderHook(() => useCart());
      }).toThrow('useCart must be used within a CartProvider');
    });
  });

  describe('checkout', () => {
    it('shows error toast when cart is empty', async () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper() });

      mockToast.show.mockClear();

      await act(async () => {
        await result.current.checkout('test@example.com');
      });

      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          title: 'Empty Cart',
        })
      );
    });
  });
});
