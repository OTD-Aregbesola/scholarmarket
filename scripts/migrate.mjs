/**
 * Versioned MongoDB migration CLI.
 *
 * Usage:
 *   npm run migrate                 Apply all pending migrations
 *   npm run migrate:status          List migrations and their applied state
 *   node scripts/migrate.mjs --down [name]   Revert a migration (default: last applied)
 *
 * Environment:
 *   MONGODB_URI   required
 *   MONGODB_DB    optional, defaults to "scholarmarket"
 */

import { MongoClient } from "mongodb";
import { getStatus, runDown, runMigrations } from "../src/lib/db/migrate.js";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "scholarmarket";

if (!MONGODB_URI) {
  console.error("[migrate] MONGODB_URI is not set. Aborting.");
  process.exit(1);
}

const args = process.argv.slice(2);
const downIndex = args.indexOf("--down");

const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const db = client.db(DB_NAME);

  if (args.includes("--status")) {
    const status = await getStatus(db);
    for (const entry of status) {
      console.log(`[${entry.applied ? "applied" : "pending"}] ${entry.name}`);
    }
  } else if (downIndex !== -1) {
    const name = args[downIndex + 1];
    if (name && name.startsWith("--")) {
      throw new Error("--down requires a migration name or no argument for the last applied");
    }
    const result = await runDown(db, name);
    console.log(`[migrate] ${result.status}: ${result.name}`);
  } else {
    const results = await runMigrations(db);
    for (const result of results) {
      if (result.status === "failed") {
        console.error(`[migrate] ${result.status}: ${result.name} (${result.error})`);
      } else {
        console.log(`[migrate] ${result.status}: ${result.name}`);
      }
    }
  }
} catch (error) {
  console.error("[migrate] Fatal error:", error);
  process.exitCode = 1;
} finally {
  await client.close();
}
