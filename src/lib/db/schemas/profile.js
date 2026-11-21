/**
 * MongoDB validator for user profiles.
 *
 * New profiles receive a `uuid` at creation time; legacy documents are
 * backfilled by the `20261120000200-assign-uuids` migration. Timestamps may
 * be Date objects or ISO strings because older code paths used strings.
 */
export const ProfileSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["walletAddress", "createdAt"],
      properties: {
        uuid: {
          bsonType: "string",
          description: "RFC 4122 UUID uniquely identifying this user across systems",
        },
        walletAddress: {
          bsonType: ["string", "null"],
          description: "Primary blockchain wallet address used for authentication",
        },
        walletAddressLower: {
          bsonType: ["string", "null"],
          description: "Lowercased wallet address used for case-insensitive lookups",
        },
        fullName: {
          bsonType: "string",
          description: "Full name supplied at profile creation",
        },
        email: {
          bsonType: "string",
          description: "Optional email address for notifications and recovery",
        },
        displayName: {
          bsonType: "string",
          description: "Optional human-readable name shown on public profile pages",
        },
        avatarCid: {
          bsonType: "string",
          description: "IPFS Content Identifier for the user's profile avatar",
        },
        avatarUrl: {
          bsonType: "string",
          description: "Optional avatar URL",
        },
        bio: {
          bsonType: "string",
          description: "Short creator biography displayed on the marketplace",
        },
        notificationPreferences: {
          bsonType: "object",
          description: "Per-category email notification opt-outs; receipts are always enabled",
          required: ["receipts"],
          properties: {
            receipts: { bsonType: "bool", description: "Transactional receipts; always true" },
            reviews: { bsonType: "bool", description: "Review activity notifications" },
            sales: { bsonType: "bool", description: "Sales and payout notifications" },
            reminders: { bsonType: "bool", description: "Inactivity reminders" },
            productUpdates: { bsonType: "bool", description: "Product update announcements" },
          },
        },
        createdAt: {
          bsonType: ["date", "string"],
          description: "Timestamp recording when the profile was first created",
        },
        updatedAt: {
          bsonType: ["date", "string"],
          description: "Timestamp of the most recent profile update",
        },
      },
    },
  },
};
