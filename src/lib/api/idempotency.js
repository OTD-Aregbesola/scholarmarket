import { createHash, randomUUID } from "node:crypto";
import { getDb as defaultGetDb } from "../mongodb.js";
import { getUserFromCookie } from "./auth.js";
import { canonicalizeJson } from "./clientIdempotency.js";
import { badRequest, conflict } from "./errorResponse.js";
import { logger } from "../logger.js";

export { canonicalizeJson };

export const IDEMPOTENCY_COLLECTION = "idempotency_keys";
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_WAIT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 25;
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
const SKIP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const ensuredDbPromises = new WeakMap();

/**
 * Computes a deterministic SHA-256 hex digest of a request payload.
 */
export function hashRequestPayload(payload) {
  let serialized;
  if (payload === undefined || payload === null || payload === "") {
    serialized = "";
  } else if (typeof payload === "string") {
    serialized = payload;
  } else {
    serialized = JSON.stringify(canonicalizeJson(payload));
  }

  return createHash("sha256").update(serialized).digest("hex");
}

/**
 * Ensures the unique key index and 24-hour TTL index exist on `idempotency_keys`.
 * Runs idempotently once per MongoDB `db` instance.
 */
export async function ensureIdempotencyIndexes(db) {
  if (!db) {
    throw new Error("Database instance is required to ensure idempotency indexes");
  }

  const existingPromise = ensuredDbPromises.get(db);
  if (existingPromise) {
    return existingPromise;
  }

  const indexPromise = (async () => {
    const collection = db.collection(IDEMPOTENCY_COLLECTION);
    await Promise.all([
      collection.createIndex(
        { key: 1 },
        { unique: true, name: "idempotency_key_unique_idx" },
      ),
      collection.createIndex(
        { createdAt: 1 },
        {
          expireAfterSeconds: IDEMPOTENCY_TTL_SECONDS,
          name: "idempotency_createdAt_ttl_idx",
        },
      ),
    ]);
  })().catch((err) => {
    ensuredDbPromises.delete(db);
    throw err;
  });

  ensuredDbPromises.set(db, indexPromise);
  return indexPromise;
}

function getHeaderCaseInsensitive(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return null;
}

function extractRoutePath(request, explicitRoute) {
  if (explicitRoute) return explicitRoute;
  if (!request?.url) return "/";
  try {
    return new URL(request.url, "http://localhost").pathname;
  } catch {
    return String(request.url);
  }
}

function wrapRequestWithBody(request, rawText, parsedJson, jsonValid) {
  const wrapper = Object.create(request);
  wrapper.text = async () => rawText;
  wrapper.json = async () => {
    if (!jsonValid) {
      return JSON.parse(rawText);
    }
    return parsedJson;
  };
  return wrapper;
}

async function readRequestPayload(request) {
  let rawText = "";
  let reqForHandler = request;

  if (typeof request?.clone === "function") {
    try {
      rawText = await request.clone().text();
    } catch {
      rawText = "";
    }
  } else if (typeof request?.text === "function") {
    rawText = await request.text();
    let parsed = null;
    let jsonValid = false;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
        jsonValid = true;
      } catch {
        jsonValid = false;
      }
    }
    reqForHandler = wrapRequestWithBody(request, rawText, parsed, jsonValid);
  } else if (typeof request?.json === "function") {
    const jsonVal = await request.json();
    rawText = jsonVal === undefined ? "" : JSON.stringify(jsonVal);
    reqForHandler = wrapRequestWithBody(request, rawText, jsonVal, true);
  } else if (request?.body !== undefined && request?.body !== null) {
    rawText = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
  }

  let parsedBody = null;
  if (rawText) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }
  }

  const requestHash = hashRequestPayload(rawText ? parsedBody : "");
  return { rawText, parsedBody, requestHash, reqForHandler };
}

async function resolveActor(request, parsedBody, customGetActor) {
  if (typeof customGetActor === "function") {
    const customActor = await customGetActor(request, parsedBody);
    return String(customActor || "anonymous").trim().toLowerCase() || "anonymous";
  }

  try {
    const user = await getUserFromCookie(request);
    const userActor = user?.walletAddress || user?.address || user?.id || user?.sub;
    if (userActor) {
      return String(userActor).trim().toLowerCase();
    }
  } catch {
    // Ignore auth lookup errors; handler enforces auth rules itself.
  }

  if (parsedBody && typeof parsedBody === "object" && parsedBody.buyerAddress) {
    return String(parsedBody.buyerAddress).trim().toLowerCase();
  }

  const headerWallet = getHeaderCaseInsensitive(request?.headers, "x-user-wallet");
  if (headerWallet) {
    return String(headerWallet).trim().toLowerCase();
  }

  return "anonymous";
}

function isDuplicateKeyError(err) {
  if (!err) return false;
  return (
    err.code === 11000 ||
    err.codeName === "DuplicateKey" ||
    /E11000|duplicate key/i.test(String(err.message || ""))
  );
}

async function extractResponseData(response) {
  const contentType = response.headers?.get?.("content-type") || "application/json";
  try {
    const text = await response.clone().text();
    if (!text) {
      return { responseBody: null, contentType };
    }
    try {
      return { responseBody: JSON.parse(text), contentType };
    } catch {
      return { responseBody: text, contentType };
    }
  } catch {
    return { responseBody: null, contentType };
  }
}

function buildReplayedResponse(record) {
  const headers = {
    "X-Idempotency-Replayed": "true",
    "Idempotency-Key": record.idempotencyKey,
  };

  if (record.responseBody === null || record.responseBody === undefined) {
    return new Response(null, { status: record.responseStatus, headers });
  }

  if (typeof record.responseBody === "string" && !String(record.contentType || "").includes("json")) {
    return new Response(record.responseBody, {
      status: record.responseStatus,
      headers: {
        ...headers,
        "Content-Type": record.contentType || "text/plain; charset=utf-8",
      },
    });
  }

  return Response.json(record.responseBody, {
    status: record.responseStatus,
    headers: {
      ...headers,
      "Content-Type": record.contentType || "application/json",
    },
  });
}

async function releaseLock(collection, key, lockToken) {
  try {
    await collection.deleteOne({ key, lockToken, status: "in_progress" });
  } catch (err) {
    logger.warn({ err, key }, "Failed to release idempotency lock");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a Next.js App Router handler with MongoDB-backed idempotency protection.
 *
 * When an `Idempotency-Key` header is present:
 * - Atomically acquires an in-progress lock via unique key constraint.
 * - Executes the underlying handler at most once across concurrent identical requests.
 * - Returns cached response for repeat requests with the same payload hash.
 * - Returns HTTP 409 Conflict when reused with a different payload hash.
 * - Releases the lock on unhandled throws or transient 5xx/401/429 responses.
 * - Falls back cleanly when `Idempotency-Key` header is omitted.
 */
export function withIdempotency(handler, options = {}) {
  const {
    route: explicitRoute,
    getDb = defaultGetDb,
    getActor,
    ttlSeconds = IDEMPOTENCY_TTL_SECONDS,
    lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
    waitTimeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = options;

  return async function idempotentHandler(request, context, ...rest) {
    const method = String(request?.method || "POST").toUpperCase();
    if (SKIP_METHODS.has(method)) {
      return handler(request, context, ...rest);
    }

    const rawKey = getHeaderCaseInsensitive(request?.headers, "idempotency-key");
    if (rawKey === null || rawKey === undefined) {
      return handler(request, context, ...rest);
    }

    const routePath = extractRoutePath(request, explicitRoute);
    const idempotencyKey = String(rawKey).trim();

    if (!idempotencyKey) {
      return badRequest("Idempotency-Key header must be a non-empty string", [], routePath);
    }

    if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return badRequest(
        `Idempotency-Key header exceeds maximum length of ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
        [],
        routePath,
      );
    }

    const { parsedBody, requestHash, reqForHandler } = await readRequestPayload(request);
    const actor = await resolveActor(request, parsedBody, getActor);
    const scopedKey = `${method}:${routePath}:${actor}:${idempotencyKey}`;

    const db = await getDb();
    await ensureIdempotencyIndexes(db);
    const collection = db.collection(IDEMPOTENCY_COLLECTION);

    const lockToken = randomUUID();
    const deadline = Date.now() + waitTimeoutMs;
    let acquired = false;

    while (!acquired) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
      const lockExpiresAt = new Date(now.getTime() + lockTimeoutMs);

      try {
        await collection.insertOne({
          key: scopedKey,
          idempotencyKey,
          route: routePath,
          method,
          actor,
          requestHash,
          status: "in_progress",
          lockToken,
          responseStatus: null,
          responseBody: null,
          contentType: null,
          createdAt: now,
          updatedAt: now,
          expiresAt,
          lockExpiresAt,
        });
        acquired = true;
        break;
      } catch (err) {
        if (!isDuplicateKeyError(err)) {
          throw err;
        }
      }

      const existing = await collection.findOne({ key: scopedKey });
      if (!existing) {
        if (Date.now() >= deadline) {
          return conflict("Unable to acquire idempotency lock; please retry", routePath);
        }
        continue;
      }

      const isExpired = Boolean(existing.expiresAt && new Date(existing.expiresAt) <= now);
      const isStaleLock = Boolean(
        existing.status === "in_progress" &&
          existing.lockExpiresAt &&
          new Date(existing.lockExpiresAt) <= now,
      );

      if (isExpired || isStaleLock) {
        const reclaimed = await collection.findOneAndUpdate(
          {
            key: scopedKey,
            $or: [
              { expiresAt: { $lte: now } },
              { status: "in_progress", lockExpiresAt: { $lte: now } },
            ],
          },
          {
            $set: {
              idempotencyKey,
              route: routePath,
              method,
              actor,
              requestHash,
              status: "in_progress",
              lockToken,
              responseStatus: null,
              responseBody: null,
              contentType: null,
              createdAt: now,
              updatedAt: now,
              expiresAt,
              lockExpiresAt,
            },
          },
          { returnDocument: "after" },
        );

        if (reclaimed && reclaimed.lockToken === lockToken) {
          acquired = true;
          break;
        }
        continue;
      }

      if (existing.requestHash !== requestHash) {
        return conflict(
          "Idempotency-Key already used with a different request payload",
          routePath,
        );
      }

      if (existing.status === "completed") {
        return buildReplayedResponse(existing);
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return conflict(
          "A request with this Idempotency-Key is currently in progress",
          routePath,
        );
      }

      await sleep(Math.min(pollIntervalMs, remainingMs));
    }

    let response;
    try {
      response = await handler(reqForHandler, context, ...rest);
    } catch (err) {
      await releaseLock(collection, scopedKey, lockToken);
      throw err;
    }

    if (!response) {
      await releaseLock(collection, scopedKey, lockToken);
      return response;
    }

    if (response.status >= 500 || response.status === 401 || response.status === 429) {
      await releaseLock(collection, scopedKey, lockToken);
      return response;
    }

    const { responseBody, contentType } = await extractResponseData(response);
    await collection.updateOne(
      { key: scopedKey, lockToken },
      {
        $set: {
          status: "completed",
          responseStatus: response.status,
          responseBody,
          contentType,
          updatedAt: new Date(),
          lockExpiresAt: null,
        },
      },
    );

    return response;
  };
}
