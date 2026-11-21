import { ObjectId } from "mongodb";

/**
 * Opaque, compound-key cursor pagination for MongoDB list endpoints.
 *
 * A cursor encodes every field in the collection's sort key plus its type so
 * values such as Date and ObjectId survive a round trip. The seek filter uses
 * the standard tuple comparison expansion, which keeps paging stable when
 * many documents share the same timestamp.
 */

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export function normalizeLimit(value, fallback = DEFAULT_PAGE_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), MAX_PAGE_LIMIT);
}

function isObjectId(value) {
  return value instanceof ObjectId || value?._bsontype === "ObjectId";
}

function serializeValue(value) {
  if (value === null || value === undefined) return { t: "null" };
  if (value instanceof Date) return { t: "date", v: value.toISOString() };
  if (isObjectId(value)) return { t: "oid", v: value.toString() };
  if (typeof value === "number") return { t: "num", v: value };
  if (typeof value === "boolean") return { t: "bool", v: value };
  return { t: "str", v: String(value) };
}

function deserializeValue(entry) {
  if (!entry) return null;
  switch (entry.t) {
    case "null":
      return null;
    case "date":
      return new Date(entry.v);
    case "oid":
      return new ObjectId(entry.v);
    case "num":
    case "bool":
    case "str":
      return entry.v;
    default:
      return entry.v;
  }
}

/** Encodes the last document's sort tuple into an opaque base64url string. */
export function encodeCursor(document, keys) {
  const payload = {
    k: keys,
    v: keys.map((key) => serializeValue(document?.[key])),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Decodes a cursor and verifies it was produced for the same sort tuple.
 * Invalid or tampered cursors throw an error carrying HTTP status 400.
 */
export function decodeCursor(raw, keys) {
  if (!raw) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8"));
  } catch {
    payload = null;
  }

  const invalid = () => {
    const error = new Error("Invalid pagination cursor");
    error.status = 400;
    error.code = "INVALID_CURSOR";
    throw error;
  };

  if (
    !payload ||
    !Array.isArray(payload.k) ||
    !Array.isArray(payload.v) ||
    payload.k.length !== payload.v.length ||
    payload.k.length !== keys.length ||
    payload.k.some((key, index) => key !== keys[index])
  ) {
    invalid();
  }

  return Object.fromEntries(
    payload.k.map((key, index) => [key, deserializeValue(payload.v[index])]),
  );
}

/** Builds the `$or` tuple comparison that seeks past the previous page. */
export function buildSeekFilter(keys, directions, values) {
  const clauses = [];
  for (let index = 0; index < keys.length; index += 1) {
    const clause = {};
    for (let prior = 0; prior < index; prior += 1) {
      clause[keys[prior]] = values[keys[prior]];
    }
    const operator = directions[index] >= 0 ? "$gt" : "$lt";
    clause[keys[index]] = { [operator]: values[keys[index]] };
    clauses.push(clause);
  }
  return { $or: clauses };
}

/**
 * Fetches one page from a MongoDB collection.
 *
 * @param {object} options
 * @param {object} options.collection A MongoDB collection-like object.
 * @param {object} [options.filter] Base match filter.
 * @param {object} options.sort Sort tuple, insertion order is significant.
 * @param {string|null} [options.cursor] Opaque cursor from a previous page.
 * @param {number|string|null} [options.limit] Page size, capped at 100.
 * @param {(doc: object) => any} [options.transform] Per-item mapper.
 * @returns {Promise<{items: any[], nextCursor: string|null, hasMore: boolean}>}
 */
export async function paginate({
  collection,
  filter = {},
  sort,
  cursor,
  limit = DEFAULT_PAGE_LIMIT,
  transform = (document) => document,
}) {
  const keys = Object.keys(sort || {});
  if (keys.length === 0) {
    throw new Error("paginate requires a non-empty sort tuple");
  }

  const directions = keys.map((key) => sort[key]);
  const safeLimit = normalizeLimit(limit);
  const values = decodeCursor(cursor, keys);
  const query = values
    ? { $and: [filter, buildSeekFilter(keys, directions, values)] }
    : filter;

  const documents = await collection
    .find(query)
    .sort(sort)
    .limit(safeLimit + 1)
    .toArray();

  const hasMore = documents.length > safeLimit;
  const page = hasMore ? documents.slice(0, safeLimit) : documents;
  const last = page[page.length - 1];

  return {
    items: page.map(transform),
    nextCursor: hasMore && last ? encodeCursor(last, keys) : null,
    hasMore,
  };
}
