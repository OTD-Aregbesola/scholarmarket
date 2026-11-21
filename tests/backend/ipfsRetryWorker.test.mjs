import assert from "node:assert/strict";
import { test, before, after, beforeEach, afterEach, mock } from "node:test";
import { register } from "node:module";

try { register("../../test/alias-loader.mjs", import.meta.url); } catch {}

process.env.MONGODB_URI ||= "mongodb://127.0.0.1:1/unused";
// auditLog() writes to audit_logs through getDb(); hand it a no-op client so nothing connects.
const noopCollection = { insertOne: async () => ({}), createIndex: async () => "" };
globalThis._mongoClientPromise = Promise.resolve({ db: () => ({ collection: () => noopCollection }) });
process.env.PINATA_JWT ||= "test-jwt";
process.env.NEXT_PUBLIC_GATEWAY_URL ||= "gateway.test.invalid";

const { http, HttpResponse } = await import("msw");
const { setupServer } = await import("msw/node");
const worker = await import("../../src/lib/ipfs/retryWorker.js");
const { processPendingPins, MAX_PIN_ATTEMPTS, RETRY_BASE_DELAY_MS, STALE_LOCK_MS, getRetryDelayMs } = worker;

// Pinata SDK v2 uploads files and JSON to POST https://uploads.pinata.cloud/v3/files
// convert() in the SDK needs a well-formed CID
const TEST_CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
let uploadCalls = 0;
let failNext = 0;
const server = setupServer(
  http.post("https://uploads.pinata.cloud/v3/files", async () => {
    uploadCalls += 1;

    if (failNext > 0) {
      failNext -= 1;
      return HttpResponse.json({ error: "temporarily unavailable" }, { status: 503 });
    }
    return HttpResponse.json({
      data: { id: `id-${uploadCalls}`, cid: TEST_CID, name: "x", size: 1 },
    });
  }),
);

// Minimal in-memory pending_pins collection covering the query shapes the worker uses.
function createPendingCollection(docs) {
  const records = new Map(docs.map((d) => [d._id, { ...d }]));
  const matchesField = (value, cond) => {
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (cond === null || typeof cond !== "object") return value === cond;
    const ops = Object.keys(cond);
    assert.ok(ops.every((op) => op === "$exists" || op === "$lte"), `unsupported operator in ${ops}`);
    if (cond.$exists === false && value !== undefined) return false;
    if (cond.$lte !== undefined && !(value !== undefined && value <= cond.$lte)) return false;
    return true;
  };
  const matches = (doc, q) => {
    if (q.$or) {
      assert.deepEqual(Object.keys(q), ["$or"]);
      return q.$or.some((clause) => matches(doc, clause));
    }
    return Object.entries(q).every(([field, cond]) => matchesField(doc[field], cond));
  };
  return {
    records,
    find(q) {
      let list = [...records.values()].filter((d) => matches(d, q)).map((d) => ({ ...d }));
      return {
        limit(n) { list = list.slice(0, n); return this; },
        async toArray() { return list; },
      };
    },
    // check-and-set in one synchronous step, returns the pre-update document (mongodb v6 shape)
    async findOneAndUpdate(q, update) {
      const doc = [...records.values()].find((d) => matches(d, q));
      if (!doc) return null;
      const before = { ...doc };
      Object.assign(doc, update.$set);
      return before;
    },
    async updateOne(q, update) {
      const doc = records.get(q._id);
      if (doc) Object.assign(doc, update.$set);
      return { matchedCount: doc ? 1 : 0 };
    },
  };
}

function createDb(docs) {
  const pins = createPendingCollection(docs);
  return { pins, db: { collection: (name) => { assert.equal(name, "pending_pins"); return pins; } } };
}

const baseJob = (over = {}) => ({
  _id: "job-1",
  status: "pending",
  otherFields: { title: "Notes" },
  ...over,
});

const origError = console.error;
before(() => { server.listen({ onUnhandledRequest: "error" }); });
beforeEach(() => {
  uploadCalls = 0;
  failNext = 0;
  console.error = () => {};
  mock.timers.enable({ apis: ["Date"], now: new Date("2030-01-01T00:00:00Z") });
});
afterEach(() => { mock.timers.reset(); console.error = origError; });
after(() => {
  server.close();
  // On Node 20.11, MSW intercepting a multipart (FormData) request leaves MessagePorts open and the
  // test process does not exit (Node 20.19 is fine). Plain fetch without MSW does not leave them.
  for (const handle of process._getActiveHandles()) {
    if (handle?.constructor?.name === "MessagePort") handle.unref();
  }
});

test("retry succeeds after transient failures and ends completed", async () => {
  const { pins, db } = createDb([baseJob()]);
  failNext = 2;
  for (let i = 0; i < 3; i += 1) {
    await processPendingPins({ db });
    mock.timers.setTime(Date.now() + getRetryDelayMs(i + 1));
  }
  const job = pins.records.get("job-1");
  assert.equal(job.status, "completed");
  assert.equal(job.attempts, 2);
  assert.ok(job.results.metadataUrl);
});

test("failed job is not picked up before its delay and is picked up after it", async () => {
  const { pins, db } = createDb([baseJob()]);
  failNext = 1;
  await processPendingPins({ db });
  assert.equal(uploadCalls, 1);
  assert.equal(pins.records.get("job-1").status, "pending");

  mock.timers.setTime(Date.now() + getRetryDelayMs(1) - 1);
  await processPendingPins({ db });
  assert.equal(uploadCalls, 1, "not due yet");

  mock.timers.setTime(Date.now() + 1);
  await processPendingPins({ db });
  assert.equal(uploadCalls, 2, "due now");
  assert.equal(pins.records.get("job-1").status, "completed");
});

test("retry delays follow the documented exponential schedule", async () => {
  assert.deepEqual(
    [1, 2, 3, 4].map(getRetryDelayMs),
    [1, 2, 4, 8].map((m) => m * RETRY_BASE_DELAY_MS),
  );
  const { pins, db } = createDb([baseJob()]);
  failNext = 100;
  for (let attempt = 1; attempt < MAX_PIN_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    await processPendingPins({ db });
    const job = pins.records.get("job-1");
    assert.equal(job.status, "pending");
    assert.equal(job.attempts, attempt);
    assert.equal(job.nextAttemptAt.getTime() - startedAt, getRetryDelayMs(attempt));
    mock.timers.setTime(job.nextAttemptAt.getTime());
  }
});

test("job is marked failed after max attempts and never picked up again", async () => {
  const { pins, db } = createDb([baseJob()]);
  failNext = 1000;
  for (let i = 0; i < MAX_PIN_ATTEMPTS - 1; i += 1) {
    await processPendingPins({ db });
    mock.timers.setTime(pins.records.get("job-1").nextAttemptAt.getTime());
  }
  assert.equal(pins.records.get("job-1").status, "pending");
  // clear the error text from earlier attempts so the last attempt must write its own
  delete pins.records.get("job-1").lastError;
  await processPendingPins({ db });
  const job = pins.records.get("job-1");
  assert.equal(job.status, "failed");
  assert.equal(job.attempts, MAX_PIN_ATTEMPTS);
  assert.ok(job.failedAt instanceof Date);
  assert.match(job.lastError, /\S/);

  const callsBefore = uploadCalls;
  mock.timers.setTime(Date.now() + 365 * 24 * 3600 * 1000);
  await processPendingPins({ db });
  assert.equal(uploadCalls, callsBefore);
  assert.equal(pins.records.get("job-1").status, "failed");
});

test("concurrent workers do not process the same job twice", async () => {
  const { pins, db } = createDb([baseJob({ _id: "a" }), baseJob({ _id: "b" })]);
  await Promise.all([processPendingPins({ db }), processPendingPins({ db })]);
  // each job uploads metadata JSON once (no file or image data)
  assert.equal(uploadCalls, 2);
  assert.equal(pins.records.get("a").status, "completed");
  assert.equal(pins.records.get("b").status, "completed");
});

test("a job that is not yet due is skipped", async () => {
  const future = new Date(Date.now() + 60_000);
  const { pins, db } = createDb([baseJob({ nextAttemptAt: future })]);
  await processPendingPins({ db });
  assert.equal(uploadCalls, 0);
  assert.equal(pins.records.get("job-1").status, "pending");
});

test("a job left in processing by a stopped worker is picked up again after the stale-lock limit", async () => {
  const lockedAt = new Date(Date.now());
  const { pins, db } = createDb([baseJob({ status: "processing", lockedAt, attempts: 1 })]);

  mock.timers.setTime(lockedAt.getTime() + STALE_LOCK_MS - 1);
  await processPendingPins({ db });
  assert.equal(uploadCalls, 0, "lock is still fresh");
  assert.equal(pins.records.get("job-1").status, "processing");

  mock.timers.setTime(lockedAt.getTime() + STALE_LOCK_MS);
  await Promise.all([processPendingPins({ db }), processPendingPins({ db })]);
  assert.equal(uploadCalls, 1, "taken over by one worker only");
  const job = pins.records.get("job-1");
  assert.equal(job.status, "completed");
  assert.equal(job.attempts, 1, "a takeover is not counted as an attempt");
});
