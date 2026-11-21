import { getDb } from "@/lib/mongodb";

const CACHE_TTL_MS = 30_000;
const cache = new Map();

function envName(key) {
  return `FEATURE_${key.replace(/[^a-z0-9]/gi, "_").toUpperCase()}`;
}

function rolloutBucket(walletAddress, key) {
  let hash = 2166136261;
  for (const char of `${key}:${walletAddress}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function enabledFor(flag, walletAddress) {
  if (!flag.enabled) return false;
  if (flag.allowlist?.includes(walletAddress)) return true;
  if (!walletAddress || !flag.rolloutPercent) return false;
  return rolloutBucket(walletAddress, flag.key) < flag.rolloutPercent;
}

export async function getFlag(key, { walletAddress } = {}) {
  const override = process.env[envName(key)];
  if (override !== undefined) return override === "true";
  const cached = cache.get(key);
  if (!cached || cached.expiresAt < Date.now()) {
    const db = await getDb();
    const flag = await db.collection("feature_flags").findOne({ key });
    cache.set(key, { flag, expiresAt: Date.now() + CACHE_TTL_MS });
    return Boolean(flag && enabledFor(flag, walletAddress));
  }
  return Boolean(cached.flag && enabledFor(cached.flag, walletAddress));
}

export async function listPublicFlags() {
  const db = await getDb();
  return db.collection("feature_flags").find({ public: true }).project({ _id: 0, key: 1, enabled: 1, rolloutPercent: 1 }).toArray();
}

export function clearFlagCache() {
  cache.clear();
}
