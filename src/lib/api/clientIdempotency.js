function fallbackUuidV4() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

/**
 * Generates a unique UUID v4 idempotency key for a checkout or purchase attempt.
 */
export function generateIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return fallbackUuidV4();
}

/**
 * Recursively canonicalizes a JSON-compatible value so equivalent objects
 * with different key ordering produce identical serialized values.
 */
export function canonicalizeJson(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value.toJSON === "function") {
    return canonicalizeJson(value.toJSON());
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : canonicalizeJson(item)));
  }
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) {
      sorted[key] = canonicalizeJson(value[key]);
    }
  }
  return sorted;
}

/**
 * Produces a deterministic string signature for a client request payload so
 * retries with identical inputs reuse the same Idempotency-Key while payload
 * changes rotate to a fresh key.
 */
export function serializeAttemptPayload(payload) {
  if (payload === undefined || payload === null) return "";
  return JSON.stringify(canonicalizeJson(payload));
}

/**
 * Manages a per-attempt Idempotency-Key:
 * - Reuses the same key across retries of the same failed/in-flight payload.
 * - Rotates to a fresh key when the payload changes, after a successful
 *   completion, or when explicitly reset.
 */
export function createIdempotencyAttemptManager() {
  let currentAttempt = null;

  return {
    getKeyForPayload(payload) {
      const signature = serializeAttemptPayload(payload);
      if (
        currentAttempt &&
        !currentAttempt.completed &&
        currentAttempt.signature === signature
      ) {
        return currentAttempt.key;
      }

      const key = generateIdempotencyKey();
      currentAttempt = { key, signature, completed: false };
      return key;
    },

    markSucceeded() {
      if (currentAttempt) {
        currentAttempt.completed = true;
      }
    },

    reset() {
      currentAttempt = null;
    },

    getCurrentKey() {
      return currentAttempt?.key ?? null;
    },
  };
}
