/**
 * Reporting helper for stale checkout intents.
 *
 * Expired intents are removed automatically by the `checkout_intents_expiresAt_ttl`
 * index created in migrations/20261120000100-indexes.mjs. This script exists to
 * report what the TTL index would remove and to inspect legacy documents that
 * predate the index. It never deletes unless --force-delete is passed.
 *
 * Usage:
 *   node scripts/clean-stale-intents.mjs
 *   node scripts/clean-stale-intents.mjs --force-delete
 *
 * Environment:
 *   MONGODB_URI   required
 *   MONGODB_DB    optional; database name (default: "scholarmarket")
 *   STALE_HOURS   optional; reporting cutoff for legacy documents (default: 2)
 */

import { MongoClient } from "mongodb";
import { pathToFileURL } from "node:url";
import { ACTIVE_CHECKOUT_STATUSES, CHECKOUT_INTENT_TTL_SECONDS } from "../src/lib/db/ttl.js";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "scholarmarket";
const FORCE_DELETE = process.argv.includes("--force-delete");
const STALE_HOURS = Number(process.env.STALE_HOURS ?? String(CHECKOUT_INTENT_TTL_SECONDS / 3600));
const COLLECTION = "checkout_intents";

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly && !MONGODB_URI) {
  console.error("[clean-stale-intents] MONGODB_URI is not set. Aborting.");
  process.exit(1);
}

if (invokedDirectly && (!Number.isFinite(STALE_HOURS) || STALE_HOURS <= 0)) {
  console.error(`[clean-stale-intents] Invalid STALE_HOURS value: "${process.env.STALE_HOURS}". Must be a positive number.`);
  process.exit(1);
}

/** Matches active intents that TTL owns: expired by expiresAt, or legacy docs. */
export function buildQuery(now = new Date(), staleHours = STALE_HOURS) {
  const legacyCutoff = new Date(now.getTime() - staleHours * 60 * 60 * 1000);
  return {
    status: { $in: [...ACTIVE_CHECKOUT_STATUSES] },
    $or: [
      { expiresAt: { $lt: now } },
      { expiresAt: { $exists: false }, createdAt: { $lt: legacyCutoff } },
    ],
  };
}

async function run() {
  const label = FORCE_DELETE ? "[FORCE DELETE] " : "[REPORT ONLY] ";
  console.log(`[clean-stale-intents] ${label}Starting. TTL: ${CHECKOUT_INTENT_TTL_SECONDS}s`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const collection = client.db(DB_NAME).collection(COLLECTION);
    const query = buildQuery();
    const count = await collection.countDocuments(query);
    console.log(`[clean-stale-intents] ${label}Found ${count} stale active intent(s).`);

    const samples = await collection
      .find(query, { projection: { _id: 1, status: 1, createdAt: 1, expiresAt: 1 } })
      .limit(5)
      .toArray();
    console.log("[clean-stale-intents] Sample matches (up to 5):", JSON.stringify(samples, null, 2));

    if (!FORCE_DELETE) {
      console.log("[clean-stale-intents] REPORT ONLY. Pass --force-delete to remove these documents.");
      return;
    }

    if (count === 0) {
      console.log("[clean-stale-intents] Nothing to clean up.");
      return;
    }

    const result = await collection.deleteMany(query);
    console.log(`[clean-stale-intents] Deleted ${result.deletedCount} stale intent(s).`);

    if (result.deletedCount !== count) {
      console.warn(
        `[clean-stale-intents] Expected to delete ${count} but deleted ${result.deletedCount}. ` +
        "Some documents may have changed between the count and delete operations.",
      );
    }
  } finally {
    await client.close();
    console.log("[clean-stale-intents] Done.");
  }
}

if (invokedDirectly) {
  run().catch((err) => {
    console.error("[clean-stale-intents] Fatal error:", err);
    process.exit(1);
  });
}
