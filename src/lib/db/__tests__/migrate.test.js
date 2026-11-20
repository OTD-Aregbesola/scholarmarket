import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MIGRATIONS_COLLECTION, getStatus, runDown, runMigrations } from "../migrate.js";

function makeDb() {
  const records = new Map();
  const migrations = {
    find: () => ({
      project: () => ({
        toArray: async () => [...records.values()].map((record) => ({ name: record.name })),
      }),
    }),
    updateOne: async (_filter, update) => {
      records.set(update.$set.name, update.$set);
      return { upsertedCount: 1, modifiedCount: 1 };
    },
    deleteOne: async (filter) => {
      records.delete(filter.name);
      return { deletedCount: 1 };
    },
  };

  return {
    records,
    collection: (name) => {
      if (name === MIGRATIONS_COLLECTION) return migrations;
      return {
        updateMany: async () => ({ matchedCount: 0, modifiedCount: 0 }),
        createIndex: async () => "index",
      };
    },
    command: async () => ({ ok: 1 }),
  };
}

async function writeMigration(directory, name, { up = "", down = "" } = {}) {
  await writeFile(
    join(directory, name),
    `export async function up(db) { (globalThis.__migCalls ||= []).push("up:${name}"); ${up} }\n` +
      `export async function down(db) { (globalThis.__migCalls ||= []).push("down:${name}"); ${down} }\n`,
  );
}

describe("migration runner (#137)", () => {
  let directory;
  let db;

  beforeEach(async () => {
    // Keep generated modules inside the project root so Vite's module loader
    // can resolve the dynamic import used by the runner.
    directory = await mkdtemp(join(process.cwd(), ".migtest-"));
    db = makeDb();
    globalThis.__migCalls = [];
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    delete globalThis.__migCalls;
  });

  it("applies migrations in filename order and makes a second run a no-op", async () => {
    await writeMigration(directory, "20260102000000-b.mjs");
    await writeMigration(directory, "20260101000000-a.mjs");

    const first = await runMigrations(db, { directory, logger: { log() {} } });
    expect(first.map((entry) => entry.name)).toEqual([
      "20260101000000-a.mjs",
      "20260102000000-b.mjs",
    ]);
    expect(first.every((entry) => entry.status === "applied")).toBe(true);
    expect(globalThis.__migCalls).toEqual(["up:20260101000000-a.mjs", "up:20260102000000-b.mjs"]);

    const second = await runMigrations(db, { directory, logger: { log() {} } });
    expect(second.every((entry) => entry.status === "skipped")).toBe(true);
    expect(globalThis.__migCalls).toHaveLength(2);
    expect(db.records.size).toBe(2);
  });

  it("reports status from the _migrations tracker", async () => {
    await writeMigration(directory, "20260101000000-a.mjs");
    await writeMigration(directory, "20260102000000-b.mjs");
    await runMigrations(db, { directory, logger: { log() {} } });

    const status = await getStatus(db, { directory });
    expect(status).toEqual([
      { name: "20260101000000-a.mjs", applied: true },
      { name: "20260102000000-b.mjs", applied: true },
    ]);
  });

  it("reverts a named migration and removes it from the tracker", async () => {
    await writeMigration(directory, "20260101000000-a.mjs");
    await runMigrations(db, { directory, logger: { log() {} } });

    const result = await runDown(db, "20260101000000-a.mjs", { directory });
    expect(result).toEqual({ name: "20260101000000-a.mjs", status: "reverted" });
    expect(globalThis.__migCalls).toContain("down:20260101000000-a.mjs");
    expect(db.records.size).toBe(0);

    const repeat = await runDown(db, "20260101000000-a.mjs", { directory });
    expect(repeat.status).toBe("not-applied");
  });

  it("reverts the last applied migration when no name is given", async () => {
    await writeMigration(directory, "20260101000000-a.mjs");
    await writeMigration(directory, "20260102000000-b.mjs");
    await runMigrations(db, { directory, logger: { log() {} } });

    const result = await runDown(db, undefined, { directory });
    expect(result.name).toBe("20260102000000-b.mjs");
    expect(result.status).toBe("reverted");
  });

  it("does not mark a failed migration or any later one as applied", async () => {
    await writeMigration(directory, "20260101000000-a.mjs", {
      up: 'throw new Error("boom")',
    });
    await writeMigration(directory, "20260102000000-b.mjs");

    await expect(runMigrations(db, { directory, logger: { log() {} } })).rejects.toThrow("boom");
    expect(db.records.size).toBe(0);
    expect(globalThis.__migCalls).not.toContain("up:20260102000000-b.mjs");
  });

  it("ignores files that do not match the migration naming convention", async () => {
    await writeMigration(directory, "README.md");
    const results = await runMigrations(db, { directory, logger: { log() {} } });
    expect(results).toEqual([]);
  });
});
