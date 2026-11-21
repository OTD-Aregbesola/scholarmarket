import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkRedis,
  computeIndexerLag,
  createRpcHealthCache,
  runDependencyChecks,
  withTimeout,
} from '../../src/lib/health/checks.js';

describe('computeIndexerLag (#155)', () => {
  it('reports zero lag when the indexer is at the chain head', () => {
    const lag = computeIndexerLag({ latestLedger: 100, lastLedger: 100, threshold: 10 });
    assert.equal(lag.lag, 0);
    assert.equal(lag.healthy, true);
  });

  it('fails when lag exceeds the threshold', () => {
    const lag = computeIndexerLag({ latestLedger: 100, lastLedger: 80, threshold: 10 });
    assert.equal(lag.lag, 20);
    assert.equal(lag.healthy, false);
  });

  it('treats a zero threshold as disabled', () => {
    const lag = computeIndexerLag({ latestLedger: 100, lastLedger: 1, threshold: 0 });
    assert.equal(lag.healthy, true);
  });

  it('treats a missing chain head as unknown but healthy', () => {
    const lag = computeIndexerLag({ latestLedger: null, lastLedger: 50, threshold: 10 });
    assert.equal(lag.lag, null);
    assert.equal(lag.healthy, true);
  });
});

describe('checkRedis (#155)', () => {
  it('treats an absent client as optional', async () => {
    assert.deepEqual(await checkRedis({ redisClient: null }), { status: 'not_configured', healthy: true });
  });

  it('reports a failed PING as unhealthy', async () => {
    const result = await checkRedis({
      redisClient: { ping: async () => { throw new Error('connection refused'); } },
    });
    assert.equal(result.healthy, false);
    assert.match(result.status, /connection refused/);
  });

  it('reports a successful PING as healthy', async () => {
    const result = await checkRedis({ redisClient: { ping: async () => 'PONG' } });
    assert.deepEqual(result, { status: 'online', healthy: true });
  });
});

describe('withTimeout (#155)', () => {
  it('passes through a fast result', async () => {
    assert.equal(await withTimeout(Promise.resolve('ok'), 1000, 'test'), 'ok');
  });

  it('rejects a hanging dependency', async () => {
    await assert.rejects(
      withTimeout(new Promise(() => {}), 5, 'stuck'),
      /stuck timed out after 5ms/,
    );
  });
});

describe('createRpcHealthCache (#155)', () => {
  it('shares one RPC call across concurrent readers and respects the TTL', async () => {
    let calls = 0;
    let clock = 1000;
    const cache = createRpcHealthCache({ ttlMs: 100, now: () => clock, timeoutMs: 1000 });
    const rpcServer = {
      getHealth: async () => {
        calls += 1;
        return { status: 'healthy', latestLedger: 100 + calls };
      },
    };

    const [a, b] = await Promise.all([cache.getHealth(rpcServer), cache.getHealth(rpcServer)]);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);

    clock += 50;
    assert.equal((await cache.getHealth(rpcServer)).latestLedger, 101);

    clock += 60;
    assert.equal((await cache.getHealth(rpcServer)).latestLedger, 102);
    assert.equal(calls, 2);
  });
});

describe('runDependencyChecks (#155)', () => {
  it('aggregates healthy and offline services', async () => {
    const result = await runDependencyChecks({
      database: async () => ({ status: 'online' }),
      redis: async () => ({ status: 'offline: down' }),
    });
    assert.equal(result.ready, false);
    assert.equal(result.services.database.healthy, true);
    assert.equal(result.services.redis.healthy, false);
  });

  it('converts a thrown check into an offline service', async () => {
    const result = await runDependencyChecks({
      email: async () => { throw new Error('boom'); },
    });
    assert.equal(result.ready, false);
    assert.match(result.services.email.status, /boom/);
  });
});
