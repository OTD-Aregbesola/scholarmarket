import { MaterialSchema } from "../src/lib/db/schemas/material.js";
import { ProfileSchema } from "../src/lib/db/schemas/profile.js";

/** Applies the JSON schema validators that previously existed only as documentation. */
const TARGETS = [
  { collection: "materials", validator: MaterialSchema.validator },
  { collection: "users", validator: ProfileSchema.validator },
];

async function ensureCollection(db, name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // 48 = NamespaceExists, which is expected on an existing deployment.
    if (error?.code !== 48) throw error;
  }
}

export async function up(db) {
  for (const { collection, validator } of TARGETS) {
    // collMod requires the collection to exist, so create it on a fresh deploy.
    await ensureCollection(db, collection);
    await db.command({
      collMod: collection,
      validator,
      validationLevel: "moderate",
      validationAction: "error",
    });
  }
  return { collections: TARGETS.map((target) => target.collection) };
}

export async function down(db) {
  for (const { collection } of TARGETS) {
    await db.command({ collMod: collection, validator: {} });
  }
  return { collections: TARGETS.map((target) => target.collection) };
}
