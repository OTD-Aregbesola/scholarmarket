import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupDatabase, teardownDatabase, clearDatabase } from "../mongodb-setup.js";
import { resetRateLimits } from "@/lib/api/rateLimit";
import {
  IDEMPOTENCY_COLLECTION,
  IDEMPOTENCY_TTL_SECONDS,
} from "@/lib/api/idempotency";

let activeDb = null;
let mockUser = {
  id: "user-1",
  walletAddress: "GBUYER11111111111111111111111111111111111111111111111111",
};

const mockApplyTaxToCheckout = vi.fn(async ({ amount }) => {
  await new Promise((resolve) => setTimeout(resolve, 25));
  return {
    baseAmount: amount,
    taxAmount: Number((amount * 0.1).toFixed(2)),
    taxRateBps: 1000,
    totalAmount: Number((amount * 1.1).toFixed(2)),
    geolocation: { country: "US", region: "CA" },
  };
});

const mockCheckBuyerTrustline = vi.fn(async () => ({ hasTrustline: true }));
const mockFindMaterial = vi.fn(async (materialId) => ({
  materialId,
  price: 50,
  visibility: "public",
}));
const mockVerifyDiscount = vi.fn(async () => ({ valid: false }));
const mockCreateEntitlement = vi.fn(async () => ({ ok: true }));
const mockBroadcastPurchaseEvent = vi.fn(async () => {});
const mockSendReceiptIfEligible = vi.fn(async () => {});

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(async () => activeDb),
}));

vi.mock("@/lib/api/auth", () => ({
  getUserFromCookie: vi.fn(async () => mockUser),
}));

vi.mock("@/lib/checkout/taxEstimator", () => ({
  applyTaxToCheckout: (...args) => mockApplyTaxToCheckout(...args),
}));

vi.mock("@/lib/checkout/discountVerifier", () => ({
  findMaterial: (...args) => mockFindMaterial(...args),
  verifyDiscount: (...args) => mockVerifyDiscount(...args),
}));

vi.mock("@/lib/stellar/horizonClient", () => ({
  checkBuyerTrustline: (...args) => mockCheckBuyerTrustline(...args),
}));

vi.mock("@/lib/entitlement", () => ({
  createEntitlement: (...args) => mockCreateEntitlement(...args),
}));

vi.mock("@/lib/webhooks/sender", () => ({
  broadcastPurchaseEvent: (...args) => mockBroadcastPurchaseEvent(...args),
}));

vi.mock("@/lib/email", () => ({
  sendReceiptIfEligible: (...args) => mockSendReceiptIfEligible(...args),
}));

let initiateCheckoutPost;
let purchasePost;

beforeAll(async () => {
  const setup = await setupDatabase();
  activeDb = setup.db;

  ({ POST: initiateCheckoutPost } = await import("@/app/api/checkout/initiate/route.js"));
  ({ POST: purchasePost } = await import("@/app/api/purchase/route.js"));
}, 60_000);

afterAll(async () => {
  await teardownDatabase();
});

beforeEach(async () => {
  await clearDatabase(activeDb);
  resetRateLimits();
  vi.clearAllMocks();
  mockUser = {
    id: "user-1",
    walletAddress: "GBUYER11111111111111111111111111111111111111111111111111",
  };
});

function buildRequest(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("Idempotency-Key Integration (MongoMemoryServer)", () => {
  describe("POST /api/checkout/initiate", () => {
    it("creates 1 checkout intent on first request and replays cached response on repeat", async () => {
      const payload = {
        materialId: "mat-checkout-1",
        amount: 50,
        asset: "XLM",
        buyerCountry: "US",
      };

      const res1 = await initiateCheckoutPost(
        buildRequest("http://localhost/api/checkout/initiate", payload, {
          "Idempotency-Key": "chk-key-1",
        }),
      );
      expect(res1.status).toBe(201);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.checkoutId).toBeDefined();

      // Repeat with identical payload (different property order) and lowercase header name
      const res2 = await initiateCheckoutPost(
        buildRequest(
          "http://localhost/api/checkout/initiate",
          {
            buyerCountry: "US",
            asset: "XLM",
            amount: 50,
            materialId: "mat-checkout-1",
          },
          { "idempotency-key": "chk-key-1" },
        ),
      );
      expect(res2.status).toBe(201);
      expect(res2.headers.get("X-Idempotency-Replayed")).toBe("true");
      const body2 = await res2.json();
      expect(body2).toEqual(body1);

      expect(mockApplyTaxToCheckout).toHaveBeenCalledTimes(1);
      const intentCount = await activeDb.collection("checkout_intents").countDocuments({});
      expect(intentCount).toBe(1);
    });

    it("returns 409 Conflict when same Idempotency-Key is reused with a different payload", async () => {
      const res1 = await initiateCheckoutPost(
        buildRequest(
          "http://localhost/api/checkout/initiate",
          { materialId: "mat-checkout-2", amount: 50, asset: "XLM" },
          { "Idempotency-Key": "chk-conflict-1" },
        ),
      );
      expect(res1.status).toBe(201);

      const res2 = await initiateCheckoutPost(
        buildRequest(
          "http://localhost/api/checkout/initiate",
          { materialId: "mat-checkout-2", amount: 75, asset: "XLM" },
          { "Idempotency-Key": "chk-conflict-1" },
        ),
      );
      expect(res2.status).toBe(409);
      const errBody = await res2.json();
      expect(errBody.status).toBe(409);
      expect(errBody.title).toBe("Conflict");
      expect(errBody.detail).toMatch(/different request payload/i);

      const intentCount = await activeDb.collection("checkout_intents").countDocuments({});
      expect(intentCount).toBe(1);
    });

    it("creates exactly one checkout intent across 10 parallel identical requests", async () => {
      const payload = {
        materialId: "mat-parallel-1",
        amount: 50,
        asset: "XLM",
        buyerCountry: "US",
      };

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          initiateCheckoutPost(
            buildRequest("http://localhost/api/checkout/initiate", payload, {
              "Idempotency-Key": "chk-parallel-10",
            }),
          ),
        ),
      );

      const bodies = await Promise.all(responses.map((r) => r.json()));
      for (let i = 0; i < responses.length; i += 1) {
        expect(responses[i].status).toBe(201);
        expect(bodies[i].checkoutId).toBe(bodies[0].checkoutId);
        expect(bodies[i]).toEqual(bodies[0]);
      }

      expect(mockApplyTaxToCheckout).toHaveBeenCalledTimes(1);
      expect(mockCheckBuyerTrustline).toHaveBeenCalledTimes(1);
      const intentCount = await activeDb.collection("checkout_intents").countDocuments({});
      expect(intentCount).toBe(1);
    });
  });

  describe("POST /api/purchase", () => {
    beforeEach(async () => {
      await activeDb.collection("materials").insertOne({
        materialId: "mat-purchase-1",
        title: "Quantum Notes",
        price: 20,
        visibility: "public",
      });
    });

    it("creates 1 purchase on first request, replays cached response on repeat, and returns 409 on payload conflict", async () => {
      const payload = {
        materialId: "mat-purchase-1",
        transactionHash: "tx-hash-abc-1",
        amount: 20,
        asset: "XLM",
        email: "learner@example.com",
      };

      const res1 = await purchasePost(
        buildRequest("http://localhost/api/purchase", payload, {
          "Idempotency-Key": "pur-key-1",
        }),
      );
      expect(res1.status).toBe(201);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.purchaseId).toBeDefined();

      // Repeat with identical payload
      const res2 = await purchasePost(
        buildRequest("http://localhost/api/purchase", payload, {
          "Idempotency-Key": "pur-key-1",
        }),
      );
      expect(res2.status).toBe(201);
      expect(res2.headers.get("X-Idempotency-Replayed")).toBe("true");
      const body2 = await res2.json();
      expect(body2).toEqual(body1);

      expect(mockCreateEntitlement).toHaveBeenCalledTimes(1);
      expect(mockBroadcastPurchaseEvent).toHaveBeenCalledTimes(1);
      expect(mockSendReceiptIfEligible).toHaveBeenCalledTimes(1);

      // Same key + different payload -> 409 Conflict
      const res3 = await purchasePost(
        buildRequest(
          "http://localhost/api/purchase",
          { ...payload, amount: 999 },
          { "Idempotency-Key": "pur-key-1" },
        ),
      );
      expect(res3.status).toBe(409);
      const errBody = await res3.json();
      expect(errBody.status).toBe(409);
      expect(errBody.title).toBe("Conflict");

      const purchaseCount = await activeDb.collection("purchases").countDocuments({});
      expect(purchaseCount).toBe(1);
    });

    it("executes exactly once across 10 parallel identical requests", async () => {
      // Introduce a small delay on entitlement creation to ensure overlap across parallel calls
      mockCreateEntitlement.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { ok: true };
      });

      const payload = {
        materialId: "mat-purchase-1",
        transactionHash: "tx-parallel-hash",
        amount: 20,
        asset: "XLM",
      };

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          purchasePost(
            buildRequest("http://localhost/api/purchase", payload, {
              "Idempotency-Key": "pur-parallel-10",
            }),
          ),
        ),
      );

      const bodies = await Promise.all(responses.map((r) => r.json()));
      for (let i = 0; i < responses.length; i += 1) {
        expect(responses[i].status).toBe(201);
        expect(bodies[i].purchaseId).toBe(bodies[0].purchaseId);
        expect(bodies[i]).toEqual(bodies[0]);
      }

      expect(mockCreateEntitlement).toHaveBeenCalledTimes(1);
      expect(mockBroadcastPurchaseEvent).toHaveBeenCalledTimes(1);
      expect(mockSendReceiptIfEligible).toHaveBeenCalledTimes(1);
      const purchaseCount = await activeDb.collection("purchases").countDocuments({});
      expect(purchaseCount).toBe(1);
    });

    it("falls back cleanly when Idempotency-Key header is omitted", async () => {
      const res = await purchasePost(
        buildRequest("http://localhost/api/purchase", {
          materialId: "mat-purchase-1",
          transactionHash: "tx-no-header",
          amount: 20,
          asset: "XLM",
        }),
      );
      expect(res.status).toBe(201);
      const count = await activeDb.collection(IDEMPOTENCY_COLLECTION).countDocuments({});
      expect(count).toBe(0);
    });
  });

  describe("TTL index, expiry, and actor scoping", () => {
    it("creates 24-hour TTL index on idempotency_keys and expires stale records", async () => {
      await initiateCheckoutPost(
        buildRequest(
          "http://localhost/api/checkout/initiate",
          { materialId: "mat-ttl-1", amount: 15, asset: "XLM" },
          { "Idempotency-Key": "ttl-key-1" },
        ),
      );

      const indexes = await activeDb.collection(IDEMPOTENCY_COLLECTION).indexes();
      const ttlIndex = indexes.find((idx) => idx.name === "idempotency_createdAt_ttl_idx");
      const uniqueIndex = indexes.find((idx) => idx.name === "idempotency_key_unique_idx");

      expect(uniqueIndex).toBeDefined();
      expect(uniqueIndex.unique).toBe(true);
      expect(ttlIndex).toBeDefined();
      expect(ttlIndex.expireAfterSeconds).toBe(IDEMPOTENCY_TTL_SECONDS);
      expect(ttlIndex.expireAfterSeconds).toBe(86400);

      // Force expiration of the stored record to verify expiry reclamation
      await activeDb.collection(IDEMPOTENCY_COLLECTION).updateMany(
        {},
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );

      const resAfterExpiry = await initiateCheckoutPost(
        buildRequest(
          "http://localhost/api/checkout/initiate",
          { materialId: "mat-ttl-1", amount: 15, asset: "XLM" },
          { "Idempotency-Key": "ttl-key-1" },
        ),
      );
      expect(resAfterExpiry.status).toBe(201);
      expect(resAfterExpiry.headers.get("X-Idempotency-Replayed")).toBeNull();
      expect(mockApplyTaxToCheckout).toHaveBeenCalledTimes(2);
    });

    it("isolates idempotency records between distinct users", async () => {
      const payload = { materialId: "mat-scope-1", amount: 30, asset: "XLM" };

      mockUser = { id: "user-a", walletAddress: "GUSERA1111111111111111111111111111111111111111111111111" };
      const resA = await initiateCheckoutPost(
        buildRequest("http://localhost/api/checkout/initiate", payload, {
          "Idempotency-Key": "same-client-key",
        }),
      );
      const bodyA = await resA.json();

      mockUser = { id: "user-b", walletAddress: "GUSERB2222222222222222222222222222222222222222222222222" };
      const resB = await initiateCheckoutPost(
        buildRequest("http://localhost/api/checkout/initiate", payload, {
          "Idempotency-Key": "same-client-key",
        }),
      );
      const bodyB = await resB.json();

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);
      expect(bodyA.checkoutId).not.toBe(bodyB.checkoutId);
    });
  });
});
