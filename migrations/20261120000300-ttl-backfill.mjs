import { TTL_BACKFILLS } from "../src/lib/db/ttl.js";

/**
 * Backfills expiresAt for legacy documents using a single server-side update
 * per collection. Only documents missing the field and in an active status
 * are touched, so the migration is idempotent.
 */
export async function up(db) {
  const results = [];

  for (const backfill of TTL_BACKFILLS) {
    const result = await db.collection(backfill.collection).updateMany(
      backfill.match,
      [{
        $set: {
          expiresAt: {
            $dateAdd: {
              startDate: `$${backfill.sourceField}`,
              unit: "second",
              amount: backfill.ttlSeconds,
            },
          },
        },
      }],
    );
    results.push({
      collection: backfill.collection,
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  }

  return results;
}

export async function down() {
  // Backfilled timestamps are indistinguishable from application-written
  // ones, so this down migration is deliberately a no-op.
  return { skipped: true };
}
