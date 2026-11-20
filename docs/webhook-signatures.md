# Verifying Outbound Webhooks

ScholarMarket signs every outbound webhook so receivers can confirm the
request came from us and was not modified in transit.

## Headers

| Header | Value |
| --- | --- |
| `X-ScholarMarket-Timestamp` | Unix timestamp in milliseconds when the request was signed |
| `X-ScholarMarket-Signature` | `sha256=` followed by the hex HMAC-SHA256 digest |

The signed input is the concatenation of the timestamp, a single dot, and the
exact raw request body:

```
${timestamp}.${rawBody}
```

The HMAC key is the `WEBHOOK_SIGNING_SECRET` environment variable. The sender
refuses to send a request when that variable is unset, so there is no unsigned
fallback.

## Verification Steps

1. Read the raw request body as bytes or as an unchanged UTF-8 string. Do not
   re-serialize parsed JSON, because key order and whitespace change the digest.
2. Read `X-ScholarMarket-Timestamp` and reject the request if it is older than
   five minutes (300 seconds). This bounds replay attacks.
3. Compute `sha256=` plus the hex HMAC-SHA256 of `${timestamp}.${rawBody}` using
   your copy of `WEBHOOK_SIGNING_SECRET`.
4. Compare the computed value with `X-ScholarMarket-Signature` using a
   constant-time comparison. Reject on any mismatch.

A reference implementation lives in `src/lib/webhooks/signing.js` under
`signWebhookPayload` and `verifyWebhookSignature`.

## Delivery and Retries

Delivery intents are stored in the shared `side_effect_outbox` collection. The
outbox worker makes up to six attempts per webhook with exponential backoff and
jitter. After the final failure the intent moves to `dead_letter`. An admin can
replay dead-lettered webhook deliveries with:

```
POST /api/admin/webhooks/replay
```

The body is optional. `intentType` defaults to `webhook` and `limit` defaults to
100, capped at 500. Replayed intents restart with a zeroed attempt count.
