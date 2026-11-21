import { getDb } from "../src/lib/mongodb.js";
import { createJsonRpcEventSource, runIndexerBatch } from "../src/lib/indexer/stellarIndexer.js";
import { runRecovery } from "../src/lib/indexer/recovery.js";
import { acquireLeaderLock } from "../src/lib/cache/redis.js";

const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL;
const contractIds = [
  process.env.NEXT_PUBLIC_MATERIAL_REGISTRY_CONTRACT_ID,
  process.env.NEXT_PUBLIC_PURCHASE_MANAGER_CONTRACT_ID,
].filter(Boolean);
const contractId =
  contractIds.length > 0 ? contractIds : process.env.NEXT_PUBLIC_SOROBAN_CONTRACT_ID;

const runMode = process.argv[2] || 'index';

if (!rpcUrl) {
  throw new Error("NEXT_PUBLIC_STELLAR_RPC_URL is required to run the Stellar indexer");
}

const db = await getDb();

let lockHandle = null;
let isShuttingDown = false;

const handleShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Indexer] Received ${signal}, gracefully shutting down...`);

  if (lockHandle) {
    try {
      await lockHandle.releaseLock();
    } catch (err) {
      console.warn(`[Indexer] Failed to release lock during shutdown: ${err.message}`);
    }
  }

  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

try {
  if (runMode === 'recover') {
    // Recovery mode: audit Horizon against the database and re-index missing transactions.
    const accountId = process.env.STELLAR_ADMIN_PUBLIC_KEY || process.argv[3];
    if (!accountId) {
      throw new Error("STELLAR_ADMIN_PUBLIC_KEY or a positional argument is required for recovery mode");
    }

    const limit = Number(process.env.RECOVERY_LOOKBACK_LEDGERS || 200);
    const result = await runRecovery({ db, accountId, limit });

    console.log(JSON.stringify({ event: "stellar_recovery_complete", ...result }));
  } else {
    // Default: run a normal indexer batch with leader lock.
    lockHandle = await acquireLeaderLock('stellar-indexer:lock', {
      ttlMs: 60000,
      renewalIntervalMs: 20000,
    });

    if (!lockHandle) {
      console.log('[Indexer] Could not acquire leader lock. Another indexer is running.');
      process.exit(0);
    }

    const result = await runIndexerBatch({
      db,
      eventSource: createJsonRpcEventSource({ rpcUrl, contractId }),
    });

    if (lockHandle) {
      await lockHandle.releaseLock();
      lockHandle = null;
    }

    console.log(JSON.stringify({ event: "stellar_indexer_batch_complete", ...result }));
  }
} catch (err) {
  console.error('[Indexer] Error:', err);
  if (lockHandle) {
    try {
      await lockHandle.releaseLock();
    } catch (releaseErr) {
      console.warn(`[Indexer] Failed to release lock: ${releaseErr.message}`);
    }
  }
  process.exit(1);
}
