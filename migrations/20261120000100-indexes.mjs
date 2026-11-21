import { REQUIRED_INDEXES } from "../src/lib/backend/schemaContracts.js";
import { TTL_INDEX_SPECS } from "../src/lib/db/ttl.js";

async function dropIndex(db, collection, target) {
  try {
    await db.collection(collection).dropIndex(target);
  } catch (error) {
    if (error?.codeName === "IndexNotFound" || error?.code === 27) return;
    throw error;
  }
}

/** Creates every application index, including TTL indexes, in one place. */
export async function up(db) {
  for (const [collection, indexes] of Object.entries(REQUIRED_INDEXES)) {
    for (const { keys, options = {} } of indexes) {
      await db.collection(collection).createIndex(keys, options);
    }
  }

  for (const spec of TTL_INDEX_SPECS) {
    await db.collection(spec.collection).createIndex(spec.key, spec.options);
  }

  return { collections: Object.keys(REQUIRED_INDEXES).length };
}

export async function down(db) {
  for (const spec of [...TTL_INDEX_SPECS].reverse()) {
    await dropIndex(db, spec.collection, spec.name);
  }
  for (const [collection, indexes] of Object.entries(REQUIRED_INDEXES)) {
    for (const { keys } of [...indexes].reverse()) {
      await dropIndex(db, collection, keys);
    }
  }
  return { dropped: true };
}
