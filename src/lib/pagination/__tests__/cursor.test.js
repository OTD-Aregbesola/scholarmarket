import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  buildSeekFilter,
  decodeCursor,
  encodeCursor,
  normalizeLimit,
  paginate,
} from "../cursor.js";

/** Minimal MongoDB find/sort/limit/toArray emulation for deterministic tests. */
function fakeCollection(docs) {
  const matchesValue = (actual, condition) => {
    if (condition === undefined) return true;
    if (
      condition &&
      typeof condition === "object" &&
      !Array.isArray(condition) &&
      !(condition instanceof Date) &&
      condition?._bsontype !== "ObjectId"
    ) {
      return Object.entries(condition).every(([op, expected]) => {
        if (op === "$gt") return actual > expected;
        if (op === "$gte") return actual >= expected;
        if (op === "$lt") return actual < expected;
        if (op === "$lte") return actual <= expected;
        if (op === "$in") return expected.some((value) => String(value) === String(actual));
        if (op === "$exists") return (actual !== undefined) === expected;
        return false;
      });
    }
    return String(actual) === String(condition);
  };

  const matches = (doc, filter = {}) =>
    Object.entries(filter).every(([key, condition]) => {
      if (key === "$and") return condition.every((part) => matches(doc, part));
      if (key === "$or") return condition.some((part) => matches(doc, part));
      return matchesValue(doc[key], condition);
    });

  const compare = (sort) => (left, right) => {
    for (const [key, direction] of Object.entries(sort)) {
      const a = left[key] ?? null;
      const b = right[key] ?? null;
      if (a === b) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a > b ? 1 : -1) * (direction >= 0 ? 1 : -1);
    }
    return 0;
  };

  return {
    find(filter = {}) {
      const matched = docs.filter((doc) => matches(doc, filter));
      let sort = {};
      let limit = Infinity;
      const cursor = {
        sort(spec) {
          sort = spec;
          return cursor;
        },
        limit(value) {
          limit = value;
          return cursor;
        },
        async toArray() {
          return [...matched].sort(compare(sort)).slice(0, limit);
        },
      };
      return cursor;
    },
  };
}

const sort = { createdAt: -1, _id: -1 };

describe("cursor helpers", () => {
  it("normalizes limit with a default and a hard cap", () => {
    expect(normalizeLimit(null)).toBe(DEFAULT_PAGE_LIMIT);
    expect(normalizeLimit("abc")).toBe(DEFAULT_PAGE_LIMIT);
    expect(normalizeLimit(-5)).toBe(DEFAULT_PAGE_LIMIT);
    expect(normalizeLimit("35.9")).toBe(35);
    expect(normalizeLimit(1000)).toBe(MAX_PAGE_LIMIT);
    expect(MAX_PAGE_LIMIT).toBe(100);
  });

  it("round-trips Date and ObjectId sort values through an opaque cursor", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const _id = new ObjectId("65b1a2c3d4e5f60718293a4b");
    const encoded = encodeCursor({ createdAt, _id }, Object.keys(sort));
    expect(encoded).not.toContain("createdAt");
    const decoded = decodeCursor(encoded, Object.keys(sort));
    expect(decoded.createdAt).toEqual(createdAt);
    expect(decoded._id.toString()).toBe(_id.toString());
  });

  it("rejects tampered or mismatched cursors with a 400-coded error", () => {
    const good = encodeCursor({ createdAt: new Date(), _id: new ObjectId() }, Object.keys(sort));
    expect(() => decodeCursor("not-a-cursor", Object.keys(sort))).toThrow(
      expect.objectContaining({ status: 400, code: "INVALID_CURSOR" }),
    );
    expect(() => decodeCursor(good, ["otherField"])).toThrow(
      expect.objectContaining({ code: "INVALID_CURSOR" }),
    );
  });

  it("builds a compound $or seek filter with the right comparator", () => {
    const filter = buildSeekFilter(["a", "b"], [1, -1], { a: 5, b: 9 });
    expect(filter.$or).toEqual([{ a: { $gt: 5 } }, { a: 5, b: { $lt: 9 } }]);
  });
});

describe("paginate", () => {
  it("pages through 10k records with no duplicates or gaps", async () => {
    const docs = Array.from({ length: 10_000 }, (_, index) => ({
      _id: new ObjectId(index.toString(16).padStart(24, "0")),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      title: `material-${index}`,
    }));
    const collection = fakeCollection(docs);

    const seen = [];
    let cursor = null;
    let pages = 0;
    do {
      const page = await paginate({ collection, filter: {}, sort, cursor, limit: 100 });
      seen.push(...page.items.map((item) => item.title));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(100);
    expect(seen).toHaveLength(10_000);
    expect(new Set(seen).size).toBe(10_000);
    expect(seen[0]).toBe("material-9999");
    expect(seen.at(-1)).toBe("material-0");
  });

  it("stays stable when many documents share the same timestamp", async () => {
    const shared = new Date("2026-02-01T00:00:00.000Z");
    const docs = Array.from({ length: 250 }, (_, index) => ({
      _id: new ObjectId(index.toString(16).padStart(24, "0")),
      createdAt: shared,
      title: `tie-${index}`,
    }));
    const collection = fakeCollection(docs);

    const seen = [];
    let cursor = null;
    do {
      const page = await paginate({ collection, filter: {}, sort, cursor, limit: 20 });
      seen.push(...page.items.map((item) => item.title));
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(250);
    expect(new Set(seen).size).toBe(250);
  });

  it("reports hasMore correctly at exact and partial boundaries", async () => {
    const docs = Array.from({ length: 40 }, (_, index) => ({
      _id: new ObjectId(index.toString(16).padStart(24, "0")),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    }));
    const collection = fakeCollection(docs);

    const first = await paginate({ collection, filter: {}, sort, limit: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();

    const second = await paginate({ collection, filter: {}, sort, cursor: first.nextCursor, limit: 20 });
    expect(second.items).toHaveLength(20);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  it("caps the requested limit at 100 and transforms items", async () => {
    const docs = Array.from({ length: 150 }, (_, index) => ({
      _id: new ObjectId(index.toString(16).padStart(24, "0")),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    }));
    const page = await paginate({
      collection: fakeCollection(docs),
      filter: {},
      sort,
      limit: "500",
      transform: (doc) => doc._id.toString(),
    });
    expect(page.items).toHaveLength(100);
    expect(typeof page.items[0]).toBe("string");
    expect(page.hasMore).toBe(true);
  });

  it("applies the base filter on every page", async () => {
    const docs = [
      { _id: new ObjectId("00000000000000000000000a"), createdAt: new Date("2026-01-02"), owner: "a" },
      { _id: new ObjectId("00000000000000000000000b"), createdAt: new Date("2026-01-01"), owner: "b" },
      { _id: new ObjectId("00000000000000000000000c"), createdAt: new Date("2026-01-03"), owner: "a" },
    ];
    const page = await paginate({
      collection: fakeCollection(docs),
      filter: { owner: "a" },
      sort,
      limit: 10,
    });
    expect(page.items).toHaveLength(2);
    expect(page.items.every((item) => item.owner === "a")).toBe(true);
  });

  it("rejects a missing sort tuple", async () => {
    await expect(
      paginate({ collection: fakeCollection([]), filter: {}, sort: {}, limit: 10 }),
    ).rejects.toThrow("non-empty sort tuple");
  });
});
