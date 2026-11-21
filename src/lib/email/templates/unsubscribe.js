import { createHmac, timingSafeEqual } from "crypto";
import { appUrl } from "./layout.js";

/** Preference keys that an unsubscribe link may opt the recipient out of. */
export const UNSUBSCRIBE_CATEGORIES = Object.freeze({
  REMINDERS: "reminders",
  PRODUCT_UPDATES: "productUpdates",
});

const ALLOWED_CATEGORIES = new Set(Object.values(UNSUBSCRIBE_CATEGORIES));

function secret() {
  const value = process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET;
  if (!value) throw new Error("UNSUBSCRIBE_SECRET (or JWT_SECRET) not configured");
  return value;
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Builds a signed, tamper-evident token for one-click unsubscribe links.
 * The token has no expiry: RFC 8058 unsubscribe links must remain valid.
 */
export function createUnsubscribeToken({ email, category }) {
  if (!email) throw new Error("Unsubscribe token requires an email");
  if (!ALLOWED_CATEGORIES.has(category)) throw new Error(`Unsupported unsubscribe category: ${category}`);

  const body = Buffer.from(JSON.stringify({ email, category })).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Verifies a token and returns its payload, or null when it is malformed,
 * tampered with, or uses an unknown category.
 */
export function verifyUnsubscribeToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  try {
    const expected = sign(body);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload.email !== "string" || !ALLOWED_CATEGORIES.has(payload.category)) return null;
    return { email: payload.email, category: payload.category };
  } catch {
    return null;
  }
}

/** Absolute URL used in both the HTML link and the List-Unsubscribe header. */
export function buildUnsubscribeUrl({ email, category }) {
  const token = createUnsubscribeToken({ email, category });
  return `${appUrl()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
