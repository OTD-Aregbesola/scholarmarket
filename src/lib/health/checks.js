/**
 * Bounded, injectable health checks shared by the liveness and readiness
 * probes. Every external call is wrapped in a timeout so a hanging dependency
 * cannot hang the probe.
 */

const DEFAULT_TIMEOUT_MS = 2000;

/** Rejects after timeoutMs instead of waiting forever on a dependency. */
export function withTimeout(promise, timeoutMs = DEFAULT_TIMEOUT_MS, label = 'dependency') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Computes indexer lag from the chain head and the last indexed ledger.
 * A missing chain head is reported as unknown lag and treated as healthy here;
 * the Stellar check itself already fails readiness in that case.
 */
export function computeIndexerLag({ latestLedger, lastLedger, threshold }) {
  const latest = Number(latestLedger) || 0;
  const last = Number(lastLedger) || 0;
  const limit = Number(threshold) || 0;
  const lag = latest > 0 ? Math.max(0, latest - last) : null;

  return {
    latestLedger: latest || null,
    lastIndexedLedger: last || null,
    lag,
    threshold: limit || null,
    healthy: lag === null || limit === 0 || lag <= limit,
  };
}

/** Short-TTL, single-flight reader for the RPC health payload. */
export function createRpcHealthCache({ ttlMs = 5000, now = () => Date.now(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let value = null;
  let expiresAt = 0;
  let inFlight = null;

  return {
    async getHealth(rpcServer) {
      if (value !== null && now() < expiresAt) return value;
      if (inFlight) return inFlight;

      inFlight = withTimeout(rpcServer.getHealth(), timeoutMs, 'RPC health')
        .then((health) => {
          value = health;
          expiresAt = now() + ttlMs;
          return health;
        })
        .finally(() => { inFlight = null; });

      return inFlight;
    },
    clear() {
      value = null;
      expiresAt = 0;
    },
  };
}

/** Pings Redis. An absent client means Redis is optional, not unavailable. */
export async function checkRedis({ redisClient, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!redisClient) return { status: 'not_configured', healthy: true };
  try {
    await withTimeout(redisClient.ping(), timeoutMs, 'Redis PING');
    return { status: 'online', healthy: true };
  } catch (error) {
    return { status: `offline: ${error.message}`, healthy: false };
  }
}

/**
 * Runs named checks concurrently and aggregates into a readiness result.
 * Each check returns a service object; a thrown error becomes an offline
 * service rather than aborting the whole probe.
 */
export async function runDependencyChecks(checks) {
  const results = await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      try {
        const service = await check();
        return [name, { ...service, healthy: service.healthy ?? service.status === 'online' }];
      } catch (error) {
        return [name, { status: `offline: ${error.message}`, healthy: false }];
      }
    }),
  );

  const services = Object.fromEntries(results);
  return {
    ready: Object.values(services).every((service) => service.healthy),
    services,
  };
}
