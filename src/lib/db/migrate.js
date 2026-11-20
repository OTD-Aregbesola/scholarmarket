import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Versioned MongoDB migration runner.
 *
 * Migration files are `<14-digit timestamp>-<name>.mjs` modules exporting
 * `up(db)` and `down(db)`. Applied names are recorded in `_migrations`, which
 * makes a second run a no-op and keeps migrations ordered by filename.
 */

export const MIGRATIONS_COLLECTION = "_migrations";
export const DEFAULT_MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const MIGRATION_FILE = /^\d{14}-[a-z0-9-]+\.mjs$/;

export async function discoverMigrations(directory = DEFAULT_MIGRATIONS_DIR) {
  const entries = await readdir(directory);
  return entries.filter((name) => MIGRATION_FILE.test(name)).sort();
}

async function loadMigration(directory, name) {
  const moduleUrl = pathToFileURL(path.join(directory, name)).href;
  const migration = await import(moduleUrl);
  if (typeof migration.up !== "function" || typeof migration.down !== "function") {
    throw new Error(`Migration ${name} must export up(db) and down(db)`);
  }
  return migration;
}

export async function getAppliedNames(db) {
  const docs = await db
    .collection(MIGRATIONS_COLLECTION)
    .find({})
    .project({ name: 1 })
    .toArray();
  return new Set(docs.map((doc) => doc.name));
}

export async function getStatus(db, { directory = DEFAULT_MIGRATIONS_DIR } = {}) {
  const names = await discoverMigrations(directory);
  const applied = await getAppliedNames(db);
  return names.map((name) => ({ name, applied: applied.has(name) }));
}

/** Applies every pending migration in order. Already applied ones are skipped. */
export async function runMigrations(db, { directory = DEFAULT_MIGRATIONS_DIR, logger = console } = {}) {
  const names = await discoverMigrations(directory);
  const applied = await getAppliedNames(db);
  const results = [];

  for (const name of names) {
    if (applied.has(name)) {
      results.push({ name, status: "skipped" });
      continue;
    }

    const migration = await loadMigration(directory, name);
    try {
      await migration.up(db);
      await db.collection(MIGRATIONS_COLLECTION).updateOne(
        { name },
        { $set: { name, appliedAt: new Date() } },
        { upsert: true },
      );
      results.push({ name, status: "applied" });
    } catch (error) {
      results.push({ name, status: "failed", error: error.message });
      throw error;
    }
  }

  return results;
}

/** Reverts one migration. When no name is given, the last applied one is used. */
export async function runDown(db, name, { directory = DEFAULT_MIGRATIONS_DIR } = {}) {
  const names = await discoverMigrations(directory);
  const applied = await getAppliedNames(db);
  const target = name || [...names].reverse().find((candidate) => applied.has(candidate));

  if (!target || !names.includes(target)) {
    throw new Error(`Unknown migration: ${target || "(none)"}`);
  }
  if (!applied.has(target)) {
    return { name: target, status: "not-applied" };
  }

  const migration = await loadMigration(directory, target);
  await migration.down(db);
  await db.collection(MIGRATIONS_COLLECTION).deleteOne({ name: target });
  return { name: target, status: "reverted" };
}
