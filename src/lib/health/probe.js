import { getDb } from '@/lib/mongodb';
import { getRedisClient } from '@/lib/cache/redis';
import { pinata } from '@/lib/pinata';
import { verifyEmailConnection } from '@/lib/email';
import { Server, rpc } from '@stellar/stellar-sdk';
import { HORIZON_URL, STELLAR_RPC_URL } from '@/lib/config/chain';
import { COLLECTIONS } from '@/lib/backend/schemaContracts';
import {
  checkRedis,
  computeIndexerLag,
  createRpcHealthCache,
  runDependencyChecks,
  withTimeout,
} from './checks';

const CHECK_TIMEOUT_MS = Number(process.env.HEALTH_CHECK_TIMEOUT_MS || 2000);
const LAG_THRESHOLD = Number(process.env.INDEXER_LAG_THRESHOLD || 50);
const RPC_CACHE = createRpcHealthCache({
  ttlMs: Number(process.env.HEALTH_RPC_CACHE_TTL_MS || 5000),
  timeoutMs: CHECK_TIMEOUT_MS,
});

async function checkRedisHealth() {
  return checkRedis({ redisClient: await getRedisClient(), timeoutMs: CHECK_TIMEOUT_MS });
}

async function checkDatabase() {
  const db = await getDb();
  await withTimeout(db.command({ ping: 1 }), CHECK_TIMEOUT_MS, 'MongoDB ping');
  return { status: 'online' };
}

async function checkPinataHealth() {
  if (!process.env.PINATA_JWT) return { status: 'offline: PINATA_JWT not configured' };
  await withTimeout(pinata.testAuthentication(), CHECK_TIMEOUT_MS, 'Pinata auth');
  return { status: 'online' };
}

async function checkEmailHealth() {
  await withTimeout(verifyEmailConnection(), CHECK_TIMEOUT_MS, 'Email verify');
  return { status: 'online' };
}

async function checkStellarHealth() {
  const horizonServer = new Server(HORIZON_URL);
  await withTimeout(horizonServer.root(), CHECK_TIMEOUT_MS, 'Horizon root');

  const health = await RPC_CACHE.getHealth(new rpc.Server(STELLAR_RPC_URL));
  if (health?.status !== 'healthy') {
    return { status: `offline: RPC status is ${health?.status || 'unknown'}` };
  }
  return { status: 'online', latestLedger: Number(health.latestLedger) || 0 };
}

async function checkIndexerHealth() {
  const db = await getDb();
  const state = await db.collection(COLLECTIONS.syncState).findOne({ _id: 'stellar:events' });
  const health = await RPC_CACHE.getHealth(new rpc.Server(STELLAR_RPC_URL));
  const lag = computeIndexerLag({
    latestLedger: health?.latestLedger,
    lastLedger: state?.lastLedger,
    threshold: LAG_THRESHOLD,
  });

  return {
    status: lag.healthy ? 'online' : `offline: indexer lag ${lag.lag} exceeds ${lag.threshold}`,
    ...lag,
  };
}

/**
 * Runs every dependency check. Returns both the rich readiness result and a
 * legacy string map so the existing /api/health contract stays compatible.
 */
export async function runHealthProbe() {
  const result = await runDependencyChecks({
    database: checkDatabase,
    redis: checkRedisHealth,
    pinata: checkPinataHealth,
    email: checkEmailHealth,
    stellar: checkStellarHealth,
    indexer: checkIndexerHealth,
  });

  const legacyServices = Object.fromEntries(
    Object.entries(result.services).map(([name, service]) => [name, service.status]),
  );
  const legacyNames = ['database', 'pinata', 'email', 'stellar'];
  const legacyReady = legacyNames.every(
    (name) => result.services[name]?.healthy === true,
  );
  const indexer = result.services.indexer || {};

  return {
    ready: result.ready,
    legacyReady,
    services: result.services,
    legacyServices,
    indexerLag: {
      lag: indexer.lag ?? null,
      latestLedger: indexer.latestLedger ?? null,
      lastIndexedLedger: indexer.lastIndexedLedger ?? null,
      threshold: indexer.threshold ?? null,
    },
  };
}
