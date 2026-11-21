import { describe, it, expect } from "vitest";
import { MaterialSchema } from "../schemas/material.js";
import { ProfileSchema } from "../schemas/profile.js";
import { up, down } from "../../../../migrations/20261120000000-schema-validators.mjs";

describe("schema validator migration (#137)", () => {
  it("applies moderate validators to materials and users, creating missing collections", async () => {
    const commands = [];
    const created = [];
    const db = {
      createCollection: async (name) => created.push(name),
      command: async (command) => commands.push(command),
    };

    await up(db);

    expect(created).toEqual(["materials", "users"]);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual({
      collMod: "materials",
      validator: MaterialSchema.validator,
      validationLevel: "moderate",
      validationAction: "error",
    });
    expect(commands[1]).toMatchObject({
      collMod: "users",
      validator: ProfileSchema.validator,
      validationLevel: "moderate",
    });
  });

  it("treats an existing collection as expected", async () => {
    const commands = [];
    const db = {
      createCollection: async () => {
        const error = new Error("exists");
        error.code = 48;
        throw error;
      },
      command: async (command) => commands.push(command),
    };

    await up(db);
    expect(commands).toHaveLength(2);
  });

  it("removes validators on rollback", async () => {
    const commands = [];
    await down({ command: async (command) => commands.push(command) });
    expect(commands).toEqual([
      { collMod: "materials", validator: {} },
      { collMod: "users", validator: {} },
    ]);
  });

  it("describes the real document shapes so validators do not reject valid inserts", () => {
    const material = MaterialSchema.validator.$jsonSchema.properties;
    expect(MaterialSchema.validator.$jsonSchema.required).toEqual([
      "title",
      "price",
      "createdAt",
    ]);
    expect(material.category.bsonType).toContain("null");
    expect(material.createdAt.bsonType).toContain("string");
    expect(material.createdAt.bsonType).toContain("date");

    const profile = ProfileSchema.validator.$jsonSchema;
    expect(profile.required).toEqual(["walletAddress", "createdAt"]);
    expect(profile.properties.uuid.bsonType).toBe("string");
    expect(profile.properties.createdAt.bsonType).toContain("string");
  });
});
