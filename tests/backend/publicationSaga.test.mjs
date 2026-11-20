/**
 * Tests for src/lib/backend/publicationSaga.js
 * Covers happy path, per-step failure with reverse-order compensation,
 * idempotent retry after partial failure, stalled saga detection, and
 * final status / audit & outbox entries.
 *
 * Uses an in-memory MongoDB mock via node:module registerHooks and
 * injectable step doubles — no real MongoDB, Pinata, or chain calls.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { registerHooks } from "node:module";
import crypto from "node:crypto";

// ── Lightweight ObjectId mock (no real mongodb package required) ──────────────

class MockObjectId {
  constructor(id) {
    if (id instanceof MockObjectId) {
      this._id = id._id;
    } else if (typeof id === "string" && id.length > 0) {
      this._id = id;
    } else {
      this._id = crypto.randomBytes(12).toString("hex");
    }
  }
  toString() {
    return this._id;
  }
  toHexString() {
    return this._id;
  }
  equals(other) {
    return other != null && String(this._id) === String(other);
  }
}

const ObjectId = MockObjectId;
globalThis.__PUBLICATION_SAGA_TEST_OBJECT_ID__ = MockObjectId;

// ── In-memory MongoDB mock ────────────────────────────────────────────────────

function setNestedPath(obj, path, value) {
  const parts = path.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

function matchesQuery(doc, query) {
  return Object.entries(query).every(([key, condition]) => {
    const val = doc[key];
    if (condition && typeof condition === "object" && !(condition instanceof ObjectId) && !(condition instanceof Date)) {
      if ("$nin" in condition) {
        return !condition.$nin.includes(val);
      }
      if ("$lt" in condition) {
        return val instanceof Date && val.getTime() < condition.$lt.getTime();
      }
    }
    if (val instanceof ObjectId || condition instanceof ObjectId) {
      return String(val) === String(condition);
    }
    return val === condition;
  });
}

function createInMemoryCollection() {
  const docs = [];

  return {
    docs,
    async insertOne(doc) {
      const stored = structuredClone(doc);
      // Preserve ObjectId and Date instances
      stored._id = doc._id ?? new ObjectId();
      if (doc.materialId) stored.materialId = doc.materialId;
      if (doc.createdAt) stored.createdAt = doc.createdAt;
      if (doc.updatedAt) stored.updatedAt = doc.updatedAt;
      docs.push(stored);
      return { insertedId: stored._id };
    },
    async findOne(query) {
      return docs.find((d) => matchesQuery(d, query)) ?? null;
    },
    find(query) {
      const matched = docs.filter((d) => matchesQuery(d, query));
      return {
        async toArray() {
          return matched;
        },
      };
    },
    async updateOne(query, update) {
      const doc = docs.find((d) => matchesQuery(d, query));
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      if (update.$set) {
        for (const [k, v] of Object.entries(update.$set)) {
          if (k.includes(".")) {
            setNestedPath(doc, k, v);
          } else {
            doc[k] = v;
          }
        }
      }
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          doc[k] = (doc[k] ?? 0) + v;
        }
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async findOneAndUpdate(query, update) {
      const doc = docs.find((d) => matchesQuery(d, query));
      if (!doc) return null;
      if (update.$set) {
        for (const [k, v] of Object.entries(update.$set)) {
          if (k.includes(".")) {
            setNestedPath(doc, k, v);
          } else {
            doc[k] = v;
          }
        }
      }
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          doc[k] = (doc[k] ?? 0) + v;
        }
      }
      return doc;
    },
  };
}

let mockCollections = {};

function resetMockDb() {
  mockCollections = {
    publication_sagas: createInMemoryCollection(),
    audit_logs: createInMemoryCollection(),
    side_effect_outbox: createInMemoryCollection(),
  };
}

const mockDb = {
  collection(name) {
    if (!mockCollections[name]) {
      mockCollections[name] = createInMemoryCollection();
    }
    return mockCollections[name];
  },
};

globalThis.__PUBLICATION_SAGA_TEST_DB__ = mockDb;

// Intercept "@/lib/mongodb" and "mongodb" so publicationSaga.js runs purely in-memory
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/mongodb") {
      return {
        shortCircuit: true,
        url: "virtual:mock-mongodb-client",
      };
    }
    if (specifier === "mongodb") {
      return {
        shortCircuit: true,
        url: "virtual:mock-mongodb-pkg",
      };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "virtual:mock-mongodb-client") {
      return {
        shortCircuit: true,
        format: "module",
        source: `export async function getDb() { return globalThis.__PUBLICATION_SAGA_TEST_DB__; }`,
      };
    }
    if (url === "virtual:mock-mongodb-pkg") {
      return {
        shortCircuit: true,
        format: "module",
        source: `export const ObjectId = globalThis.__PUBLICATION_SAGA_TEST_OBJECT_ID__;`,
      };
    }
    return nextLoad(url, context);
  },
});

const {
  PUBLICATION_STATES,
  createPublicationSaga,
  getSagaByIdempotencyKey,
  getSagaByMaterialId,
  transitionSagaState,
  failSagaStep,
  getStalledSagas,
  compensateSaga,
  completeSaga,
} = await import("../../src/lib/backend/publicationSaga.js");

// ── Injectable Step-Double Saga Runner ────────────────────────────────────────

const SAGA_PIPELINE = [
  {
    name: "upload",
    fromState: PUBLICATION_STATES.PENDING,
    proofKey: PUBLICATION_STATES.UPLOAD_DONE,
  },
  {
    name: "pinIpfs",
    fromState: PUBLICATION_STATES.UPLOAD_DONE,
    proofKey: PUBLICATION_STATES.IPFS_PINNED,
  },
  {
    name: "registerSoroban",
    fromState: PUBLICATION_STATES.IPFS_PINNED,
    proofKey: PUBLICATION_STATES.SOROBAN_REGISTERED,
  },
  {
    name: "finalizeChain",
    fromState: PUBLICATION_STATES.SOROBAN_REGISTERED,
    proofKey: PUBLICATION_STATES.CHAIN_FINALIZED,
  },
  {
    name: "indexMaterial",
    fromState: PUBLICATION_STATES.CHAIN_FINALIZED,
    proofKey: PUBLICATION_STATES.INDEXED,
  },
  {
    name: "complete",
    fromState: PUBLICATION_STATES.INDEXED,
    proofKey: PUBLICATION_STATES.COMPLETE,
  },
];

function createDefaultStepDoubles(callLog, { failAt = null } = {}) {
  const stepResults = {
    upload: { blobUrl: "https://blob.test/file.pdf" },
    pinIpfs: { cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi" },
    registerSoroban: { contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" },
    finalizeChain: { txHash: "0xabc123def456" },
    indexMaterial: { indexedId: "idx-001" },
    complete: { finalized: true },
  };

  const steps = {};
  for (const { name } of SAGA_PIPELINE) {
    steps[name] = async (ctx) => {
      callLog.push(`exec:${name}`);
      if (failAt === name) {
        throw new Error(`${name} failed`);
      }
      return stepResults[name];
    };
  }

  const compensations = {
    unpin_ipfs: async (rollback) => {
      callLog.push(`compensate:unpin_ipfs:${rollback.cid}`);
    },
    mark_unregistered: async (rollback) => {
      callLog.push(`compensate:mark_unregistered:${rollback.contractId}`);
    },
    mark_draft: async (rollback) => {
      callLog.push(`compensate:mark_draft:${rollback.txHash}`);
    },
  };

  return { steps, compensations };
}

/**
 * Orchestrates a full publication saga using publicationSaga.js persistence
 * functions and injectable step/compensation/audit/outbox doubles.
 */
async function executePublicationSaga({
  materialId,
  idempotencyKey,
  steps,
  compensations,
  auditLog,
  outbox,
}) {
  let saga = await getSagaByIdempotencyKey(idempotencyKey);
  if (!saga) {
    saga = await createPublicationSaga(materialId, idempotencyKey);
    await auditLog.insertOne({
      sagaId: saga._id,
      materialId: saga.materialId,
      event: "saga_created",
      state: saga.state,
    });
  }

  // Idempotent no-op if already complete
  if (saga.state === PUBLICATION_STATES.COMPLETE) {
    return { status: PUBLICATION_STATES.COMPLETE, saga, compensated: [] };
  }

  // If retrying after a previous failure, resume from the failed step
  if (saga.state === PUBLICATION_STATES.FAILED && saga.lastError?.failedAt) {
    const resumeState = saga.lastError.failedAt;
    await mockDb.collection("publication_sagas").updateOne(
      { _id: saga._id },
      { $set: { state: resumeState } }
    );
    saga = await getSagaByIdempotencyKey(idempotencyKey);
  }

  const ctx = { materialId, idempotencyKey, proofs: {} };

  for (const step of SAGA_PIPELINE) {
    // Skip steps already completed (idempotent retry)
    if (saga.stepProofs?.[step.proofKey]) {
      ctx.proofs[step.name] = saga.stepProofs[step.proofKey].proof;
      continue;
    }

    try {
      const proof = await steps[step.name](ctx);
      ctx.proofs[step.name] = proof;

      saga = await transitionSagaState(saga._id, step.fromState, proof);

      await auditLog.insertOne({
        sagaId: saga._id,
        event: `step_completed:${step.name}`,
        state: saga.state,
      });
    } catch (err) {
      saga = await failSagaStep(saga._id, step.fromState, err.message);
      const compensation = await compensateSaga(saga);

      for (const rollback of compensation.rollbacks) {
        if (compensations[rollback.action]) {
          await compensations[rollback.action](rollback);
        }
      }

      await auditLog.insertOne({
        sagaId: saga._id,
        event: `step_failed:${step.name}`,
        reason: err.message,
        state: PUBLICATION_STATES.FAILED,
        rollbacks: compensation.rollbacks,
      });

      await outbox.insertOne({
        sourceAggregate: "publication_saga",
        sourceId: String(saga._id),
        status: "pending",
        intent: {
          type: "publication_failed",
          materialId: String(materialId),
          failedStep: step.name,
          rollbacks: compensation.rollbacks,
        },
      });

      return {
        status: PUBLICATION_STATES.FAILED,
        saga: await getSagaByIdempotencyKey(idempotencyKey),
        compensated: compensation.rollbacks,
      };
    }
  }

  saga = await completeSaga(saga._id);

  await auditLog.insertOne({
    sagaId: saga._id,
    event: "saga_completed",
    state: PUBLICATION_STATES.COMPLETE,
  });

  await outbox.insertOne({
    sourceAggregate: "publication_saga",
    sourceId: String(saga._id),
    status: "pending",
    intent: {
      type: "publication_completed",
      materialId: String(materialId),
      idempotencyKey,
    },
  });

  return { status: PUBLICATION_STATES.COMPLETE, saga, compensated: [] };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe("publicationSaga", () => {
  let auditLog;
  let outbox;

  beforeEach(() => {
    resetMockDb();
    auditLog = mockDb.collection("audit_logs");
    outbox = mockDb.collection("side_effect_outbox");
  });

  describe("Happy path", () => {
    it("runs all steps in order, reaches COMPLETE, and records audit & outbox entries", async () => {
      const callLog = [];
      const { steps, compensations } = createDefaultStepDoubles(callLog);
      const materialId = new ObjectId();
      const idempotencyKey = "pub-happy-001";

      const result = await executePublicationSaga({
        materialId,
        idempotencyKey,
        steps,
        compensations,
        auditLog,
        outbox,
      });

      assert.equal(result.status, PUBLICATION_STATES.COMPLETE);
      assert.equal(result.saga.state, PUBLICATION_STATES.COMPLETE);
      assert.ok(result.saga.completedAt instanceof Date);
      assert.deepEqual(result.compensated, []);

      // Assert exact execution order
      assert.deepEqual(callLog, [
        "exec:upload",
        "exec:pinIpfs",
        "exec:registerSoroban",
        "exec:finalizeChain",
        "exec:indexMaterial",
        "exec:complete",
      ]);

      // Assert audit entries
      const auditEvents = auditLog.docs.map((d) => d.event);
      assert.deepEqual(auditEvents, [
        "saga_created",
        "step_completed:upload",
        "step_completed:pinIpfs",
        "step_completed:registerSoroban",
        "step_completed:finalizeChain",
        "step_completed:indexMaterial",
        "step_completed:complete",
        "saga_completed",
      ]);

      // Assert outbox entry
      assert.equal(outbox.docs.length, 1);
      assert.equal(outbox.docs[0].sourceAggregate, "publication_saga");
      assert.equal(outbox.docs[0].status, "pending");
      assert.equal(outbox.docs[0].intent.type, "publication_completed");
      assert.equal(outbox.docs[0].intent.idempotencyKey, idempotencyKey);
    });
  });

  describe("Per-step failure & reverse-order compensation", () => {
    const failureCases = [
      {
        failAt: "upload",
        expectedExec: ["exec:upload"],
        expectedRollbacks: [],
        expectedCompensateCalls: [],
      },
      {
        failAt: "pinIpfs",
        expectedExec: ["exec:upload", "exec:pinIpfs"],
        expectedRollbacks: [],
        expectedCompensateCalls: [],
      },
      {
        failAt: "registerSoroban",
        expectedExec: ["exec:upload", "exec:pinIpfs", "exec:registerSoroban"],
        expectedRollbacks: ["unpin_ipfs"],
        expectedCompensateCalls: [
          "compensate:unpin_ipfs:bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        ],
      },
      {
        failAt: "finalizeChain",
        expectedExec: [
          "exec:upload",
          "exec:pinIpfs",
          "exec:registerSoroban",
          "exec:finalizeChain",
        ],
        expectedRollbacks: ["mark_unregistered", "unpin_ipfs"],
        expectedCompensateCalls: [
          "compensate:mark_unregistered:CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
          "compensate:unpin_ipfs:bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        ],
      },
      {
        failAt: "indexMaterial",
        expectedExec: [
          "exec:upload",
          "exec:pinIpfs",
          "exec:registerSoroban",
          "exec:finalizeChain",
          "exec:indexMaterial",
        ],
        expectedRollbacks: ["mark_draft", "mark_unregistered", "unpin_ipfs"],
        expectedCompensateCalls: [
          "compensate:mark_draft:0xabc123def456",
          "compensate:mark_unregistered:CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
          "compensate:unpin_ipfs:bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        ],
      },
      {
        failAt: "complete",
        expectedExec: [
          "exec:upload",
          "exec:pinIpfs",
          "exec:registerSoroban",
          "exec:finalizeChain",
          "exec:indexMaterial",
          "exec:complete",
        ],
        expectedRollbacks: ["mark_draft", "mark_unregistered", "unpin_ipfs"],
        expectedCompensateCalls: [
          "compensate:mark_draft:0xabc123def456",
          "compensate:mark_unregistered:CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
          "compensate:unpin_ipfs:bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        ],
      },
    ];

    for (const tc of failureCases) {
      it(`fails at ${tc.failAt} and compensates prior steps in reverse order`, async () => {
        const callLog = [];
        const { steps, compensations } = createDefaultStepDoubles(callLog, {
          failAt: tc.failAt,
        });
        const materialId = new ObjectId();
        const idempotencyKey = `pub-fail-${tc.failAt}`;

        const result = await executePublicationSaga({
          materialId,
          idempotencyKey,
          steps,
          compensations,
          auditLog,
          outbox,
        });

        assert.equal(result.status, PUBLICATION_STATES.FAILED);
        assert.equal(result.saga.state, PUBLICATION_STATES.FAILED);
        assert.equal(result.saga.lastError.reason, `${tc.failAt} failed`);
        assert.equal(result.saga.retries, 1);

        // Assert rollback actions are in reverse order
        assert.deepEqual(
          result.compensated.map((r) => r.action),
          tc.expectedRollbacks
        );

        // Assert exact sequence of executions followed by reverse compensations
        assert.deepEqual(callLog, [
          ...tc.expectedExec,
          ...tc.expectedCompensateCalls,
        ]);

        // Assert failure audit entry
        const lastAudit = auditLog.docs[auditLog.docs.length - 1];
        assert.equal(lastAudit.event, `step_failed:${tc.failAt}`);
        assert.equal(lastAudit.state, PUBLICATION_STATES.FAILED);

        // Assert failure outbox entry
        assert.equal(outbox.docs.length, 1);
        assert.equal(outbox.docs[0].intent.type, "publication_failed");
        assert.equal(outbox.docs[0].intent.failedStep, tc.failAt);
      });
    }
  });

  describe("Idempotency on retry after partial failure", () => {
    it("resumes from failed step without re-running completed steps and completes cleanly", async () => {
      const materialId = new ObjectId();
      const idempotencyKey = "pub-retry-001";

      // First attempt fails at registerSoroban
      const firstCallLog = [];
      const firstDoubles = createDefaultStepDoubles(firstCallLog, {
        failAt: "registerSoroban",
      });

      const firstResult = await executePublicationSaga({
        materialId,
        idempotencyKey,
        steps: firstDoubles.steps,
        compensations: firstDoubles.compensations,
        auditLog,
        outbox,
      });

      assert.equal(firstResult.status, PUBLICATION_STATES.FAILED);
      assert.deepEqual(firstCallLog, [
        "exec:upload",
        "exec:pinIpfs",
        "exec:registerSoroban",
        "compensate:unpin_ipfs:bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      ]);

      // Second attempt with same idempotencyKey succeeds from registerSoroban onward
      const retryCallLog = [];
      const retryDoubles = createDefaultStepDoubles(retryCallLog);

      const retryResult = await executePublicationSaga({
        materialId,
        idempotencyKey,
        steps: retryDoubles.steps,
        compensations: retryDoubles.compensations,
        auditLog,
        outbox,
      });

      assert.equal(retryResult.status, PUBLICATION_STATES.COMPLETE);
      assert.equal(retryResult.saga.state, PUBLICATION_STATES.COMPLETE);
      // Only one saga document exists for this idempotencyKey
      assert.equal(mockDb.collection("publication_sagas").docs.length, 1);
      // upload and pinIpfs were NOT re-executed
      assert.deepEqual(retryCallLog, [
        "exec:registerSoroban",
        "exec:finalizeChain",
        "exec:indexMaterial",
        "exec:complete",
      ]);

      // Third attempt on already-COMPLETE saga is a complete no-op
      const thirdCallLog = [];
      const thirdDoubles = createDefaultStepDoubles(thirdCallLog);

      const thirdResult = await executePublicationSaga({
        materialId,
        idempotencyKey,
        steps: thirdDoubles.steps,
        compensations: thirdDoubles.compensations,
        auditLog,
        outbox,
      });

      assert.equal(thirdResult.status, PUBLICATION_STATES.COMPLETE);
      assert.deepEqual(thirdCallLog, []);
    });
  });

  describe("State machine & query helpers", () => {
    it("throws on invalid state transition", async () => {
      const saga = await createPublicationSaga(new ObjectId(), "pub-invalid-001");
      await assert.rejects(
        () => transitionSagaState(saga._id, PUBLICATION_STATES.COMPLETE, {}),
        /Invalid state transition from complete/
      );
    });

    it("retrieves saga by materialId", async () => {
      const materialId = new ObjectId();
      const created = await createPublicationSaga(materialId, "pub-mat-001");
      const found = await getSagaByMaterialId(materialId);
      assert.ok(found);
      assert.equal(String(found._id), String(created._id));
    });

    it("detects only stalled in-progress sagas older than maxAgeMs", async () => {
      const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const stalled = await createPublicationSaga(new ObjectId(), "pub-stalled");
      const completed = await createPublicationSaga(new ObjectId(), "pub-done");
      const fresh = await createPublicationSaga(new ObjectId(), "pub-fresh");

      // Age stalled and completed sagas
      await mockDb.collection("publication_sagas").updateOne(
        { _id: stalled._id },
        { $set: { updatedAt: oldDate } }
      );
      await completeSaga(completed._id);
      await mockDb.collection("publication_sagas").updateOne(
        { _id: completed._id },
        { $set: { updatedAt: oldDate } }
      );

      const results = await getStalledSagas(60 * 60 * 1000);
      assert.equal(results.length, 1);
      assert.equal(String(results[0]._id), String(stalled._id));
      assert.notEqual(String(results[0]._id), String(fresh._id));
    });
  });
});
