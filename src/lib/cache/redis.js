let client = null;

export async function getRedisClient() {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    try {
      const { createClient } = await import('redis');
      const connectTimeoutMs = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10);
      const commandTimeoutMs = parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS || '5000', 10);
      const reconnectStrategy = (retries) => Math.min(retries * 50, 500);

      client = createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: connectTimeoutMs,
          reconnectStrategy,
        },
        commandsQueueBehavior: 'block',
      });

      client.on('error', (err) => console.error('Redis error', err.message));

      // Set command timeout if supported by redis client version
      if (client.commandsQueueMaxLen !== undefined) {
        // Timeout for individual commands during idle periods
      }

      await Promise.race([
        client.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Redis connection timeout after ${connectTimeoutMs}ms`)), commandTimeoutMs)
        ),
      ]);
    } catch (err) {
      console.warn('Failed to initialize Redis client:', err.message);
      client = null;
      return null;
    }
  }
  return client;
}

export async function cacheGet(key) {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

export async function cacheSet(key, value, ttlSeconds = 600) {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch { /* no-op */ }
}

export async function cacheDel(key) {
  const redis = await getRedisClient();
  if (!redis) return;
  try { await redis.del(key); } catch { /* no-op */ }
}

export async function cacheSetAdd(key, member) {
  const redis = await getRedisClient();
  if (!redis) return;
  try { await redis.sAdd(key, member); } catch { /* no-op */ }
}

export async function cacheSetMembers(key) {
  const redis = await getRedisClient();
  if (!redis) return [];
  try { return await redis.sMembers(key); } catch { return []; }
}

export async function cacheDeleteMany(keys) {
  if (!keys || keys.length === 0) return;
  const redis = await getRedisClient();
  if (!redis) return;
  try { await redis.del(keys); } catch { /* no-op */ }
}

export async function cacheExpire(key, ttlSeconds) {
  const redis = await getRedisClient();
  if (!redis) return;
  try { await redis.expire(key, ttlSeconds); } catch { /* no-op */ }
}

export async function cacheDelPattern(pattern) {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys && keys.length > 0) {
      await redis.del(keys);
    }
  } catch (err) {
    console.warn(`[Redis] Pattern deletion failed for ${pattern}:`, err.message);
  }
}

export async function invalidateMarketplaceCache() {
  await Promise.all([
    cacheDelPattern('market-materials:*'),
    cacheDelPattern('materials:*'),
    cacheDelPattern('materials-search:*'),
  ]);
}

export async function acquireLeaderLock(lockKey, { ttlMs = 30000, renewalIntervalMs = 10000 } = {}) {
  const redis = await getRedisClient();
  if (!redis) return null;

  const lockValue = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

  try {
    const acquired = await redis.set(lockKey, lockValue, {
      NX: true,
      PX: ttlMs,
    });

    if (!acquired) {
      return null;
    }

    console.log(`[Redis] Acquired leader lock: ${lockKey}`);

    const renewalTimer = setInterval(async () => {
      try {
        const currentValue = await redis.get(lockKey);
        if (currentValue === lockValue) {
          await redis.pExpire(lockKey, ttlMs);
        } else {
          clearInterval(renewalTimer);
          console.log(`[Redis] Lost leader lock: ${lockKey}`);
        }
      } catch (err) {
        console.warn(`[Redis] Lock renewal failed: ${err.message}`);
      }
    }, renewalIntervalMs);

    return {
      lockValue,
      releaseLock: async () => {
        clearInterval(renewalTimer);
        try {
          const currentValue = await redis.get(lockKey);
          if (currentValue === lockValue) {
            await redis.del(lockKey);
            console.log(`[Redis] Released leader lock: ${lockKey}`);
          }
        } catch (err) {
          console.warn(`[Redis] Lock release failed: ${err.message}`);
        }
      },
    };
  } catch (err) {
    console.warn(`[Redis] Failed to acquire lock ${lockKey}: ${err.message}`);
    return null;
  }
}

export async function releaseLeaderLock(lockKey, lockValue) {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    const currentValue = await redis.get(lockKey);
    if (currentValue === lockValue) {
      await redis.del(lockKey);
      console.log(`[Redis] Released leader lock: ${lockKey}`);
    }
  } catch (err) {
    console.warn(`[Redis] Failed to release lock ${lockKey}: ${err.message}`);
  }
}

