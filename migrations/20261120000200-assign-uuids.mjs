import { randomUUID } from "node:crypto";

/** Backfills uuid on legacy users. Replaces the former standalone script. */
export async function up(db) {
  const users = db.collection("users");
  const cursor = users.find({ uuid: { $exists: false } }).project({ _id: 1 });
  let processed = 0;

  for await (const user of cursor) {
    const result = await users.updateOne(
      { _id: user._id, uuid: { $exists: false } },
      { $set: { uuid: randomUUID() } },
    );
    processed += result.modifiedCount;
  }

  return { processed };
}

export async function down() {
  // Assigning a uuid is irreversible: the value may already be referenced by
  // external systems. This down migration is deliberately a no-op.
  return { skipped: true };
}
