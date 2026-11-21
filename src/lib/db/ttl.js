/**
 * TTL index specifications shared by the application and the migration
 * runner. Keeping them here means the index definition and its tests cannot
 * drift apart.
 */

export const CHALLENGE_TTL_SECONDS = 5 * 60;
export const CHECKOUT_INTENT_TTL_SECONDS = 30 * 60;

/** Intents that are still waiting for a buyer action are the only ones eligible for TTL. */
export const ACTIVE_CHECKOUT_STATUSES = ["initiated", "pending"];

export const TTL_INDEX_SPECS = [
  {
    collection: "auth_challenges",
    name: "auth_challenges_expiresAt_ttl",
    key: { expiresAt: 1 },
    options: {
      name: "auth_challenges_expiresAt_ttl",
      expireAfterSeconds: 0,
    },
  },
  {
    collection: "checkout_intents",
    name: "checkout_intents_expiresAt_ttl",
    key: { expiresAt: 1 },
    options: {
      name: "checkout_intents_expiresAt_ttl",
      expireAfterSeconds: 0,
      partialFilterExpression: {
        status: { $in: [...ACTIVE_CHECKOUT_STATUSES] },
      },
    },
  },
];

/** TTL backfill for legacy documents, expressed per collection. */
export const TTL_BACKFILLS = [
  {
    collection: "auth_challenges",
    match: { expiresAt: { $exists: false } },
    ttlSeconds: CHALLENGE_TTL_SECONDS,
    sourceField: "createdAt",
  },
  {
    collection: "checkout_intents",
    match: {
      status: { $in: [...ACTIVE_CHECKOUT_STATUSES] },
      expiresAt: { $exists: false },
    },
    ttlSeconds: CHECKOUT_INTENT_TTL_SECONDS,
    sourceField: "createdAt",
  },
];
