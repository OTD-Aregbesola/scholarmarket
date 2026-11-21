import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  IDEMPOTENCY_COLLECTION,
  IDEMPOTENCY_TTL_SECONDS,
  canonicalizeJson,
  ensureIdempotencyIndexes,
  hashRequestPayload,
  withIdempotency,
} from "../../src/lib/api/idempotency.js";

function createInMemoryIdempotencyDb() {
  const docs = new Map();
  const indexes = [];

  const collection = {
    async createIndex(keys, options = {}) {
      const existing = indexes.find((idx) => idx.name === options.name);
      if (!existing) {
        indexes.push({ key: keys, ...options });
      }
      return options.name || "idx";
    },
    async indexes() {
      return indexes;
    },
    async findOne(query) {
      return docs.get(query.key) || null;
    },
    async insertOne(doc) {
      if (docs.has(doc.key)) {
        const err = new Error(`E11000 duplicate key error collection: ${IDEMPOTENCY_COLLECTION}`);
        err.code = 11000;
        throw err;
      }
      docs.set(doc.key, { ...doc });
      return { acknowledged: true, insertedId: doc.key };
    },
    async findOneAndUpdate(filter, update) {
      const existing = docs.get(filter.key);
      if (!existing) return null;

      const orConditions = filter.$or || [];
      const matchesOr = orConditions.some((cond) => {
        if (cond.expiresAt?.$lte) {
          return existing.expiresAt && new Date(existing.expiresAt) <= cond.expiresAt.$lte;
        }
        if (cond.status && cond.lockExpiresAt?.$lte) {
          return (
            existing.status === cond.status &&
            existing.lockExpiresAt &&
            new Date(existing.lockExpiresAt) <= cond.lockExpiresAt.$lte
          );
        }
        return false;
      });

      if (!matchesOr) return null;

      const nextDoc = { ...existing, ...(update.$set || {}) };
      docs.set(filter.key, nextDoc);
      return { ...nextDoc };
    },
    async updateOne(filter, update) {
      const existing = docs.get(filter.key);
      if (!existing || existing.lockToken !== filter.lockToken) {
        return { matchedCount: 0, modifiedCount: 0 };
      }
      docs.set(filter.key, { ...existing, ...(update.$set || {}) });
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async deleteOne(filter) {
      const existing = docs.get(filter.key);
      if (
        existing &&
        existing.lockToken === filter.lockToken &&
        existing.status === filter.status
      ) {
        docs.delete(filter.key);
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    },
  };

  return {
    docs,
    collection(name) {
      assert.equal(name, IDEMPOTENCY_COLLECTION);
      return collection;
    },
  };
}

function makeRequest(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("withIdempotency middleware", () => {
  test("canonicalizeJson and hashRequestPayload produce identical hashes regardless of key order", () => {
    const a = { materialId: "m-1", amount: 10, meta: { b: 2, a: 1 } };
    const b = { meta: { a: 1, b: 2 }, amount: 10, materialId: "m-1" };
    assert.deepEqual(canonicalizeJson(a), canonicalizeJson(b));
    assert.equal(hashRequestPayload(a), hashRequestPayload(b));
    assert.notEqual(hashRequestPayload(a), hashRequestPayload({ ...a, amount: 20 }));
  });

  test("ensures unique key index and 24-hour TTL index idempotently", async () => {
    const db = createInMemoryIdempotencyDb();
    await Promise.all([ensureIdempotencyIndexes(db), ensureIdempotencyIndexes(db)]);

    const idxList = await db.collection(IDEMPOTENCY_COLLECTION).indexes();
    const uniqueIdx = idxList.find((idx) => idx.name === "idempotency_key_unique_idx");
    const ttlIdx = idxList.find((idx) => idx.name === "idempotency_createdAt_ttl_idx");

    assert.ok(uniqueIdx, "unique index should be created");
    assert.equal(uniqueIdx.unique, true);
    assert.deepEqual(uniqueIdx.key, { key: 1 });

    assert.ok(ttlIdx, "TTL index should be created");
    assert.equal(ttlIdx.expireAfterSeconds, IDEMPOTENCY_TTL_SECONDS);
    assert.equal(ttlIdx.expireAfterSeconds, 86400);
    assert.deepEqual(ttlIdx.key, { createdAt: 1 });
  });

  test("passes through requests without Idempotency-Key header", async () => {
    const db = createInMemoryIdempotencyDb();
    let calls = 0;

    const wrapped = withIdempotency(
      async (req) => {
        calls += 1;
        const body = await req.json();
        return Response.json({ calls, materialId: body.materialId }, { status: 201 });
      },
      { route: "/api/checkout/initiate", getDb: async () => db },
    );

    const r1 = await wrapped(makeRequest("http://localhost/api/checkout/initiate", { materialId: "m1" }));
    const r2 = await wrapped(makeRequest("http://localhost/api/checkout/initiate", { materialId: "m1" }));

    assert.equal(calls, 2);
    assert.equal((await r1.json()).calls, 1);
    assert.equal((await r2.json()).calls, 2);
  });

  test("returns cached response on repeat key + identical payload and 409 on payload mismatch", async () => {
    const db = createInMemoryIdempotencyDb();
    let calls = 0;

    const wrapped = withIdempotency(
      async (req) => {
        calls += 1;
        const body = await req.json();
        return Response.json({ checkoutId: `chk-${calls}`, amount: body.amount }, { status: 201 });
      },
      {
        route: "/api/checkout/initiate",
        getDb: async () => db,
        getActor: () => "GBUYER1",
      },
    );

    const first = await wrapped(
      makeRequest(
        "http://localhost/api/checkout/initiate",
        { materialId: "m1", amount: 25 },
        { "Idempotency-Key": "idem-123" },
      ),
    );
    assert.equal(first.status, 201);
    assert.deepEqual(await first.json(), { checkoutId: "chk-1", amount: 25 });

    // Repeat with case-insensitive header and reordered JSON keys
    const replay = await wrapped(
      makeRequest(
        "http://localhost/api/checkout/initiate",
        { amount: 25, materialId: "m1" },
        { "idempotency-key": "idem-123" },
      ),
    );
    assert.equal(replay.status, 201);
    assert.equal(replay.headers.get("X-Idempotency-Replayed"), "true");
    assert.deepEqual(await replay.json(), { checkoutId: "chk-1", amount: 25 });
    assert.equal(calls, 1);

    // Same key + different payload -> 409 Conflict
    const conflictRes = await wrapped(
      makeRequest(
        "http://localhost/api/checkout/initiate",
        { materialId: "m1", amount: 99 },
        { "Idempotency-Key": "idem-123" },
      ),
    );
    assert.equal(conflictRes.status, 409);
    const conflictBody = await conflictRes.json();
    assert.equal(conflictBody.status, 409);
    assert.equal(conflictBody.title, "Conflict");
    assert.equal(calls, 1);
  });

  test("ten parallel identical requests execute handler exactly once", async () => {
    const db = createInMemoryIdempotencyDb();
    let invocations = 0;

    const wrapped = withIdempotency(
      async () => {
        invocations += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return Response.json({ success: true, checkoutId: "chk-single" }, { status: 201 });
      },
      {
        route: "/api/checkout/initiate",
        getDb: async () => db,
        getActor: () => "GBUYER_PARALLEL",
        pollIntervalMs: 10,
      },
    );

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        wrapped(
          makeRequest(
            "http://localhost/api/checkout/initiate",
            { materialId: "m1", amount: 50, asset: "XLM" },
            { "Idempotency-Key": "parallel-key-1" },
          ),
        ),
      ),
    );

    assert.equal(invocations, 1);
    const payloads = await Promise.all(responses.map((r) => r.json()));
    for (let i = 0; i < responses.length; i += 1) {
      assert.equal(responses[i].status, 201);
      assert.deepEqual(payloads[i], { success: true, checkoutId: "chk-single" });
    }
  });

  test("releases lock on unhandled throw or 5xx error so retries succeed", async () => {
    const db = createInMemoryIdempotencyDb();
    let attempt = 0;

    const wrapped = withIdempotency(
      async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error("Transient DB failure");
        }
        if (attempt === 2) {
          return Response.json({ error: "Server error" }, { status: 500 });
        }
        return Response.json({ success: true, attempt }, { status: 201 });
      },
      {
        route: "/api/purchase",
        getDb: async () => db,
        getActor: () => "GBUYER_RETRY",
      },
    );

    await assert.rejects(
      () =>
        wrapped(
          makeRequest("http://localhost/api/purchase", { materialId: "m1" }, { "Idempotency-Key": "retry-key" }),
        ),
      /Transient DB failure/,
    );
    assert.equal(db.docs.size, 0);

    const serverErr = await wrapped(
      makeRequest("http://localhost/api/purchase", { materialId: "m1" }, { "Idempotency-Key": "retry-key" }),
    );
    assert.equal(serverErr.status, 500);
    assert.equal(db.docs.size, 0);

    const success = await wrapped(
      makeRequest("http://localhost/api/purchase", { materialId: "m1" }, { "Idempotency-Key": "retry-key" }),
    );
    assert.equal(success.status, 201);
    assert.deepEqual(await success.json(), { success: true, attempt: 3 });
  });

  test("scopes keys by actor and endpoint so identical keys do not collide across users or routes", async () => {
    const db = createInMemoryIdempotencyDb();
    let actor = "GUSER_A";

    const makeHandler = (route) =>
      withIdempotency(
        async () => Response.json({ route, actor }, { status: 201 }),
        { route, getDb: async () => db, getActor: () => actor },
      );

    const checkoutHandler = makeHandler("/api/checkout/initiate");
    const purchaseHandler = makeHandler("/api/purchase");

    const r1 = await checkoutHandler(
      makeRequest("http://localhost/api/checkout/initiate", { materialId: "m1" }, { "Idempotency-Key": "shared-key" }),
    );
    const r2 = await purchaseHandler(
      makeRequest("http://localhost/api/purchase", { materialId: "m1" }, { "Idempotency-Key": "shared-key" }),
    );

    actor = "GUSER_B";
    const r3 = await checkoutHandler(
      makeRequest("http://localhost/api/checkout/initiate", { materialId: "m1" }, { "Idempotency-Key": "shared-key" }),
    );

    assert.deepEqual(await r1.json(), { route: "/api/checkout/initiate", actor: "GUSER_A" });
    assert.deepEqual(await r2.json(), { route: "/api/purchase", actor: "GUSER_A" });
    assert.deepEqual(await r3.json(), { route: "/api/checkout/initiate", actor: "GUSER_B" });
  });
});
