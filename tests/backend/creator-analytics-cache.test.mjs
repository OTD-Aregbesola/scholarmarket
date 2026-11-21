import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  buildCreatorAnalyticsKey,
  getAnalyticsCacheStats,
  getOrComputeAnalytics,
  normalizeAnalyticsRange,
  resetAnalyticsCacheStats,
} from '../../src/lib/cache/creatorAnalytics.js';

delete process.env.REDIS_URL;

describe('creator analytics cache keys (#161)', () => {
  it('includes creator, both range bounds and granularity', () => {
    const key = buildCreatorAnalyticsKey({
      creator: 'GCREATOR',
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-20T00:00:00.000Z'),
      granularity: 'day',
    });
    assert.equal(
      key,
      'creator-analytics:gcreator:2026-11-01T00:00:00.000Z:2026-11-20T00:00:00.000Z:day',
    );
  });

  it('produces identical keys regardless of creator address case', () => {
    const args = {
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-02T00:00:00.000Z'),
      granularity: 'day',
    };
    assert.equal(
      buildCreatorAnalyticsKey({ ...args, creator: 'GAbCd' }),
      buildCreatorAnalyticsKey({ ...args, creator: 'gabcd' }),
    );
  });

  it('buckets the default range to stable UTC day boundaries', () => {
    const first = normalizeAnalyticsRange({ from: new Date(), to: new Date('2026-11-20T15:42:11.000Z') });
    const second = normalizeAnalyticsRange({ from: new Date(), to: new Date('2026-11-20T01:05:00.000Z') });
    assert.deepEqual(first, second);
    assert.equal(first.from.toISOString(), '2026-10-21T00:00:00.000Z');
    assert.equal(first.to.toISOString(), '2026-11-20T00:00:00.000Z');
  });

  it('buckets explicit ranges to minute boundaries', () => {
    const result = normalizeAnalyticsRange({
      from: new Date('2026-11-01T10:30:29.000Z'),
      to: new Date('2026-11-20T10:30:01.000Z'),
      fromProvided: true,
      toProvided: true,
    });
    assert.equal(result.from.toISOString(), '2026-11-01T10:30:00.000Z');
    assert.equal(result.to.toISOString(), '2026-11-20T10:31:00.000Z');
  });
});

describe('creator analytics cache execution (#161, #161 performance)', () => {
  afterEach(() => resetAnalyticsCacheStats());

  it('runs the computation once for concurrent callers of the same key', async () => {
    let resolveCompute;
    let calls = 0;
    const compute = () => {
      calls += 1;
      return new Promise((resolve) => { resolveCompute = resolve; });
    };

    const first = getOrComputeAnalytics({ key: 'shared-key', creator: 'gabc', compute });
    const second = getOrComputeAnalytics({ key: 'shared-key', creator: 'gabc', compute });
    // getOrComputeAnalytics awaits the cache read before claiming single-flight.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);

    resolveCompute({ totalRevenue: 12 });
    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual(a.data, { totalRevenue: 12 });
    assert.deepEqual(b.data, { totalRevenue: 12 });
    assert.equal(calls, 1);
    assert.equal(getAnalyticsCacheStats().shared, 1);
    assert.equal(getAnalyticsCacheStats().misses, 1);
  });

  it('still computes when Redis is unavailable', async () => {
    const result = await getOrComputeAnalytics({
      key: 'no-redis-key',
      creator: 'gabc',
      compute: async () => ({ totalSales: 7 }),
    });
    assert.deepEqual(result.data, { totalSales: 7 });
    assert.equal(result.cacheHit, false);
  });
});
