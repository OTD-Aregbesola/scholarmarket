import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheSetAdd,
  cacheSetMembers,
  cacheDeleteMany,
  cacheExpire,
} from './redis.js';

const DEFAULT_TTL_SECONDS = 60;
const TTL_JITTER_SECONDS = 10;
const KEY_INDEX_TTL_SECONDS = 60 * 60;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// In-process single-flight map. Concurrent misses for the same key share one
// computation instead of each running the full aggregation pipeline.
const pendingComputations = new Map();

const stats = { hits: 0, misses: 0, shared: 0, invalidations: 0 };

export function getAnalyticsCacheStats() {
  return { ...stats };
}

export function resetAnalyticsCacheStats() {
  stats.hits = 0;
  stats.misses = 0;
  stats.shared = 0;
  stats.invalidations = 0;
}

function getTtlSeconds() {
  const configured = Number.parseInt(process.env.CREATOR_ANALYTICS_CACHE_TTL_SECONDS || '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_SECONDS;
}

function normalizeCreator(creator) {
  return String(creator ?? '').trim().toLowerCase();
}

function startOfUtcDay(value) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Buckets a date range so default dashboard loads share a cache key for the
 * whole UTC day, while explicit ranges are bucketed to minute boundaries.
 * Bounding `from` down and `to` up keeps the bucket a superset of the request.
 */
export function normalizeAnalyticsRange({ from, to, fromProvided = false, toProvided = false } = {}) {
  const fallbackTo = new Date();
  const parsedTo = to instanceof Date && !Number.isNaN(to.getTime()) ? to : fallbackTo;
  const parsedFrom = from instanceof Date && !Number.isNaN(from.getTime())
    ? from
    : new Date(parsedTo.getTime() - 30 * DAY_MS);

  if (!fromProvided && !toProvided) {
    const bucketedTo = startOfUtcDay(parsedTo);
    return { from: new Date(bucketedTo.getTime() - 30 * DAY_MS), to: bucketedTo };
  }

  return {
    from: new Date(Math.floor(parsedFrom.getTime() / MINUTE_MS) * MINUTE_MS),
    to: new Date(Math.ceil(parsedTo.getTime() / MINUTE_MS) * MINUTE_MS),
  };
}

/** Builds a stable, creator-scoped cache key including range and granularity. */
export function buildCreatorAnalyticsKey({ creator, from, to, granularity = 'day' }) {
  const parts = [
    'creator-analytics',
    normalizeCreator(creator),
    new Date(from).toISOString(),
    new Date(to).toISOString(),
    String(granularity),
  ];
  return parts.join(':');
}

function keyIndexKey(creator) {
  return `creator-analytics:keys:${normalizeCreator(creator)}`;
}

/**
 * Reads a cached payload or computes and stores it once per key. Redis failures
 * are swallowed by the redis helpers, so the computation still runs and the
 * endpoint degrades to a cache miss rather than failing.
 */
export async function getOrComputeAnalytics({ key, creator, compute, ttlSeconds }) {
  const cached = await cacheGet(key);
  if (cached !== null && cached !== undefined) {
    stats.hits += 1;
    return { data: cached, cacheHit: true };
  }

  if (pendingComputations.has(key)) {
    stats.shared += 1;
    return { data: await pendingComputations.get(key), cacheHit: true };
  }

  stats.misses += 1;
  const ttl = ttlSeconds || getTtlSeconds();
  const jitteredTtl = ttl + Math.floor(Math.random() * (TTL_JITTER_SECONDS + 1));

  const computation = (async () => {
    const data = await compute();
    await cacheSet(key, data, jitteredTtl);
    await cacheSetAdd(keyIndexKey(creator), key);
    await cacheExpire(keyIndexKey(creator), KEY_INDEX_TTL_SECONDS);
    return data;
  })();

  pendingComputations.set(key, computation);
  try {
    return { data: await computation, cacheHit: false };
  } finally {
    pendingComputations.delete(key);
  }
}

/** Invalidates every cached range for a creator without scanning Redis keys. */
export async function invalidateCreatorAnalytics(creator) {
  const indexKey = keyIndexKey(creator);
  const keys = await cacheSetMembers(indexKey);
  stats.invalidations += 1;
  if (keys.length === 0) {
    await cacheDel(indexKey);
    return 0;
  }
  await cacheDeleteMany([...keys, indexKey]);
  return keys.length;
}

/**
 * Resolves the creator from a material document and invalidates their analytics.
 * Used from the indexer purchase and refund paths where only materialId is
 * guaranteed to be present.
 */
export async function invalidateCreatorAnalyticsForMaterial(db, materialId) {
  if (!db || !materialId) return 0;
  try {
    const material = await db.collection('materials').findOne({
      $or: [{ materialId: String(materialId) }, { _id: materialId }],
    });
    const creator = material?.userAddress || material?.creatorId || material?.creatorAddress;
    if (!creator) return 0;
    return await invalidateCreatorAnalytics(creator);
  } catch {
    return 0;
  }
}
