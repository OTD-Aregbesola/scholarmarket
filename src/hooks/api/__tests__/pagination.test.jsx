import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { queryKeys } from "@/lib/query/queryKeys";
import { useUserMaterials } from "../useMaterials";
import { usePurchaseHistory, usePurchasedMaterials } from "../usePurchases";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

describe("infinite pagination hooks (#134)", () => {
  it("useUserMaterials loads page 1 then follows the returned cursor", async () => {
    let secondCursor = null;
    server.use(
      http.get("*/api/materials", ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (!cursor) {
          return HttpResponse.json({
            items: [{ _id: "1", title: "first" }],
            nextCursor: "cursor-2",
            hasMore: true,
          });
        }
        secondCursor = cursor;
        return HttpResponse.json({
          items: [{ _id: "2", title: "second" }],
          nextCursor: null,
          hasMore: false,
        });
      }),
    );

    const { Wrapper, queryClient } = makeWrapper();
    const { result } = renderHook(() => useUserMaterials(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.pages[0].items).toHaveLength(1);
    expect(result.current.hasNextPage).toBe(true);
    expect(queryClient.getQueryData(queryKeys.materials.all)).toBeDefined();

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(secondCursor).toBe("cursor-2");
    await waitFor(() => expect(result.current.data.pages).toHaveLength(2));
    expect(result.current.data.pages.flatMap((page) => page.items)).toHaveLength(2);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("usePurchasedMaterials uses the library query key and stops without a cursor", async () => {
    let requests = 0;
    server.use(
      http.get("*/api/purchased-materials", () => {
        requests += 1;
        return HttpResponse.json({
          items: [{ purchaseId: "p1", material: { title: "Owned" } }],
          nextCursor: null,
          hasMore: false,
        });
      }),
    );

    const { Wrapper, queryClient } = makeWrapper();
    const { result } = renderHook(() => usePurchasedMaterials(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.pages[0].items[0].purchaseId).toBe("p1");
    expect(result.current.hasNextPage).toBe(false);
    expect(queryClient.getQueryData(queryKeys.purchases.library())).toBeDefined();
    expect(requests).toBe(1);
  });

  it("usePurchaseHistory exposes an error state and keeps the history key", async () => {
    server.use(
      http.get("*/api/purchase", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );

    const { Wrapper, queryClient } = makeWrapper();
    const { result } = renderHook(() => usePurchaseHistory(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryState(queryKeys.purchases.history())?.status).toBe("error");
  });
});
