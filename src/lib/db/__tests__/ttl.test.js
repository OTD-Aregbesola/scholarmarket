import { describe, it, expect } from "vitest";
import {
  ACTIVE_CHECKOUT_STATUSES,
  CHALLENGE_TTL_SECONDS,
  CHECKOUT_INTENT_TTL_SECONDS,
  TTL_BACKFILLS,
  TTL_INDEX_SPECS,
} from "../ttl.js";
import { up as backfillTtl } from "../../../../migrations/20261120000300-ttl-backfill.mjs";
import { up as createIndexes } from "../../../../migrations/20261120000100-indexes.mjs";
import { CHALLENGE_TTL_MS } from "../../auth/challenge.js";

describe("TTL index specifications (#140)", () => {
  it("uses short TTLs that match the insert-time constants", () => {
    expect(CHALLENGE_TTL_SECONDS).toBe(300);
    expect(CHALLENGE_TTL_MS).toBe(CHALLENGE_TTL_SECONDS * 1000);
    expect(CHECKOUT_INTENT_TTL_SECONDS).toBe(1800);
  });

  it("expires documents immediately once expiresAt passes", () => {
    for (const spec of TTL_INDEX_SPECS) {
      expect(spec.options.expireAfterSeconds).toBe(0);
      expect(spec.key).toEqual({ expiresAt: 1 });
    }
  });

  it("partial-indexes checkout intents to active statuses only", () => {
    const intents = TTL_INDEX_SPECS.find((spec) => spec.collection === "checkout_intents");
    expect(intents.options.partialFilterExpression).toEqual({
      status: { $in: [...ACTIVE_CHECKOUT_STATUSES] },
    });
    expect(ACTIVE_CHECKOUT_STATUSES).toContain("initiated");
    expect(ACTIVE_CHECKOUT_STATUSES).not.toContain("completed");
    expect(ACTIVE_CHECKOUT_STATUSES).not.toContain("refunded");
  });

  it("has a plain TTL index for auth challenges", () => {
    const challenges = TTL_INDEX_SPECS.find((spec) => spec.collection === "auth_challenges");
    expect(challenges.options.partialFilterExpression).toBeUndefined();
  });

  it("creates the TTL specs through the index migration", async () => {
    const created = [];
    const db = {
      collection: (name) => ({
        createIndex: async (key, options) => created.push({ name, key, options }),
      }),
    };
    await createIndexes(db);
    for (const spec of TTL_INDEX_SPECS) {
      expect(created).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: spec.collection, key: spec.key, options: spec.options }),
        ]),
      );
    }
  });
});

describe("TTL backfill (#140)", () => {
  it("only backfills active intents and challenges missing expiresAt", async () => {
    const calls = [];
    const db = {
      collection: (name) => ({
        updateMany: async (filter, pipeline) => {
          calls.push({ collection: name, filter, pipeline });
          return { matchedCount: 3, modifiedCount: 3 };
        },
      }),
    };

    const results = await backfillTtl(db);
    expect(results).toHaveLength(2);

    const intents = calls.find((call) => call.collection === "checkout_intents");
    expect(intents.filter).toEqual({
      status: { $in: [...ACTIVE_CHECKOUT_STATUSES] },
      expiresAt: { $exists: false },
    });

    const challenges = calls.find((call) => call.collection === "auth_challenges");
    expect(challenges.filter).toEqual({ expiresAt: { $exists: false } });

    for (const call of calls) {
      const set = call.pipeline[0].$set.expiresAt.$dateAdd;
      expect(set.unit).toBe("second");
      expect(set.amount).toBeGreaterThan(0);
      expect(set.startDate).toBe("$createdAt");
    }
  });

  it("leaves documents that already have expiresAt untouched", () => {
    for (const backfill of TTL_BACKFILLS) {
      expect(backfill.match.expiresAt).toEqual({ $exists: false });
    }
  });
});
