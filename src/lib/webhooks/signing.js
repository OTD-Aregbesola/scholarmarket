import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-scholarmarket-signature';
export const TIMESTAMP_HEADER = 'x-scholarmarket-timestamp';
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function getWebhookSigningSecret() {
  return process.env.WEBHOOK_SIGNING_SECRET || '';
}

/** Produces the signature over `${timestamp}.${rawBody}` using HMAC-SHA256. */
export function signWebhookPayload({ secret, timestamp, body }) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('WEBHOOK_SIGNING_SECRET is not configured');
  }
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const signedInput = `${timestamp}.${rawBody}`;
  const digest = createHmac('sha256', secret).update(signedInput).digest('hex');
  return { timestamp: String(timestamp), signature: `sha256=${digest}` };
}

/** Constant-time verification used by the documentation contract and tests. */
export function verifyWebhookSignature({
  secret,
  timestamp,
  body,
  signature,
  now = Date.now(),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
}) {
  const expected = signWebhookPayload({ secret, timestamp, body }).signature;
  const supplied = String(signature || '');
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  if (!timingSafeEqual(expectedBuffer, suppliedBuffer)) return false;

  const ageSeconds = Math.abs(Math.floor(now / 1000) - Math.floor(Number(timestamp) / 1000));
  return Number.isFinite(ageSeconds) && ageSeconds <= toleranceSeconds;
}

/**
 * Sends one signed webhook request. Delivery retries, backoff and the dead
 * letter queue are owned by the outbox, so this function never retries.
 * Fails closed when no signing secret is configured.
 */
export async function sendSignedWebhook(url, payload, {
  secret = getWebhookSigningSecret(),
  fetchImpl = fetch,
  timeoutMs = 5000,
  now = Date.now(),
} = {}) {
  if (!secret) {
    throw new Error('WEBHOOK_SIGNING_SECRET is not configured; refusing to send unsigned webhook');
  }

  const body = JSON.stringify(payload);
  const { timestamp, signature } = signWebhookPayload({ secret, timestamp: now, body });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ScholarMarket-Webhook-Sender/2.0',
        [TIMESTAMP_HEADER]: timestamp,
        [SIGNATURE_HEADER]: signature,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Webhook responded ${response.status} ${response.statusText}`.trim());
    }
    return true;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Webhook timed out after ${timeoutMs}ms for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
