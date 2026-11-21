import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreatePurchase, useInitiateCheckout } from "@/hooks/api/usePurchases";
import { CartProvider, useCart } from "@/providers/CartProvider";

const mockToast = {
  show: vi.fn(() => "toast-1"),
  update: vi.fn(),
};

vi.mock("@/hooks/useToast", () => ({
  useToast: () => mockToast,
}));

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    isConnected: true,
    address: "GBUYER11111111111111111111111111111111111111111111111111",
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("Checkout & Purchase Client Idempotency-Key Hooks", () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("useCreatePurchase generates an Idempotency-Key, reuses it on retry, and rotates on success or payload change", async () => {
    const sentKeys = [];

    fetchSpy.mockImplementation(async (_url, init) => {
      const key = init?.headers?.["Idempotency-Key"];
      sentKeys.push(key);

      // First call fails transiently
      if (sentKeys.length === 1) {
        return new Response(JSON.stringify({ error: "Temporary outage" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, purchaseId: `pur-${sentKeys.length}` }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });

    const { result } = renderHook(() => useCreatePurchase(), {
      wrapper: createWrapper(),
    });

    const payload = {
      materialId: "mat-1",
      buyerAddress: "GBUYER1",
      transactionHash: "tx-1",
      amount: 10,
      asset: "XLM",
    };

    // 1. Initial attempt fails
    await expect(
      act(async () => {
        await result.current.mutateAsync(payload);
      }),
    ).rejects.toThrow("Temporary outage");

    expect(sentKeys[0]).toMatch(/^[0-9a-f-]{36}$/i);

    // 2. Retry with identical payload reuses the exact same Idempotency-Key
    await act(async () => {
      await result.current.mutateAsync({ ...payload });
    });
    expect(sentKeys[1]).toBe(sentKeys[0]);

    // 3. New attempt after success rotates to a new Idempotency-Key
    await act(async () => {
      await result.current.mutateAsync(payload);
    });
    expect(sentKeys[2]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sentKeys[2]).not.toBe(sentKeys[1]);

    // 4. Changing payload before success (fail -> modify payload -> retry) rotates to a new key
    fetchSpy.mockImplementationOnce(async (_url, init) => {
      sentKeys.push(init?.headers?.["Idempotency-Key"]);
      return new Response(JSON.stringify({ error: "Network error" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ ...payload, amount: 15 });
      }),
    ).rejects.toThrow();

    await act(async () => {
      await result.current.mutateAsync({ ...payload, amount: 20 });
    });

    expect(sentKeys[4]).not.toBe(sentKeys[3]);
  });

  it("useCreatePurchase.reset() clears current attempt key so next call uses a fresh key", async () => {
    const sentKeys = [];
    fetchSpy.mockImplementation(async (_url, init) => {
      sentKeys.push(init?.headers?.["Idempotency-Key"]);
      if (sentKeys.length === 1) {
        return new Response(JSON.stringify({ error: "Failed" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });

    const { result } = renderHook(() => useCreatePurchase(), {
      wrapper: createWrapper(),
    });

    const payload = { materialId: "mat-reset", amount: 5, asset: "XLM" };

    await expect(
      act(async () => {
        await result.current.mutateAsync(payload);
      }),
    ).rejects.toThrow();

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(sentKeys).toHaveLength(2);
    expect(sentKeys[1]).not.toBe(sentKeys[0]);
  });

  it("useInitiateCheckout generates, reuses across retries, and rotates Idempotency-Key", async () => {
    const sentKeys = [];

    fetchSpy.mockImplementation(async (url, init) => {
      expect(url).toBe("/api/checkout/initiate");
      sentKeys.push(init?.headers?.["Idempotency-Key"]);

      if (sentKeys.length === 1) {
        return new Response(JSON.stringify({ error: "Gateway timeout" }), {
          status: 504,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, checkoutId: `chk-${sentKeys.length}` }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });

    const { result } = renderHook(() => useInitiateCheckout(), {
      wrapper: createWrapper(),
    });

    const checkoutPayload = { materialId: "mat-2", amount: 42, asset: "XLM" };

    await expect(
      act(async () => {
        await result.current.mutateAsync(checkoutPayload);
      }),
    ).rejects.toThrow();

    await act(async () => {
      await result.current.mutateAsync(checkoutPayload);
    });
    expect(sentKeys[1]).toBe(sentKeys[0]);

    await act(async () => {
      await result.current.mutateAsync(checkoutPayload);
    });
    expect(sentKeys[2]).not.toBe(sentKeys[1]);
  });

  it("CartProvider reuses Idempotency-Key across failed checkout retry and rotates on next checkout", async () => {
    vi.useFakeTimers();
    try {
      const sentCalls = [];
      fetchSpy.mockImplementation(async (_url, init) => {
        const key = init?.headers?.["Idempotency-Key"];
        const body = JSON.parse(init.body);
        sentCalls.push({ key, body });

        if (sentCalls.length === 1) {
          return new Response(JSON.stringify({ error: "Server busy" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true, purchaseId: "pur-cart-1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      });

      const wrapper = ({ children }) => <CartProvider>{children}</CartProvider>;
      const { result } = renderHook(() => useCart(), { wrapper });

      act(() => {
        result.current.addToCart({ _id: "mat-cart-1", title: "Notes", price: 10 });
      });

      // Attempt 1 (fails on API call)
      await act(async () => {
        const promise = result.current.checkout("buyer@example.com");
        await vi.runAllTimersAsync();
        await promise;
      });

      // Retry same cart checkout
      await act(async () => {
        const promise = result.current.checkout("buyer@example.com");
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(sentCalls).toHaveLength(2);
      expect(sentCalls[0].key).toMatch(/^[0-9a-f-]{36}$/i);
      expect(sentCalls[1].key).toBe(sentCalls[0].key);
      expect(sentCalls[1].body.transactionHash).toBe(sentCalls[0].body.transactionHash);

      // Re-add item and start a brand new checkout -> rotates to fresh key
      act(() => {
        result.current.addToCart({ _id: "mat-cart-1", title: "Notes", price: 10 });
      });

      await act(async () => {
        const promise = result.current.checkout("buyer@example.com");
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(sentCalls).toHaveLength(3);
      expect(sentCalls[2].key).not.toBe(sentCalls[1].key);
    } finally {
      vi.useRealTimers();
    }
  });
});
