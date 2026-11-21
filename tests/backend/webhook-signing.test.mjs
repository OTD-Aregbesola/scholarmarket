import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  DEFAULT_TOLERANCE_SECONDS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  getWebhookSigningSecret,
  sendSignedWebhook,
  signWebhookPayload,
  verifyWebhookSignature,
} from '../../src/lib/webhooks/signing.js';

const SECRET = 'test-webhook-secret';
const NOW = 1_700_000_000_000;

afterEach(() => {
  delete process.env.WEBHOOK_SIGNING_SECRET;
});

describe('webhook signature algorithm (#149)', () => {
  it('produces a deterministic sha256 signature over timestamp and body', () => {
    const body = JSON.stringify({ event: 'purchase.completed', id: 1 });
    const first = signWebhookPayload({ secret: SECRET, timestamp: NOW, body });
    const second = signWebhookPayload({ secret: SECRET, timestamp: NOW, body });
    assert.deepEqual(first, second);
    assert.equal(first.timestamp, String(NOW));
    assert.match(first.signature, /^sha256=[0-9a-f]{64}$/);
  });

  it('accepts a valid signature within the tolerance window', () => {
    const body = '{"event":"refund.completed"}';
    const { timestamp, signature } = signWebhookPayload({ secret: SECRET, timestamp: NOW, body });
    assert.equal(
      verifyWebhookSignature({ secret: SECRET, timestamp, body, signature, now: NOW + 60_000 }),
      true,
    );
  });

  it('rejects a tampered body, wrong secret and malformed signature', () => {
    const body = '{"amount":100}';
    const { timestamp, signature } = signWebhookPayload({ secret: SECRET, timestamp: NOW, body });
    assert.equal(verifyWebhookSignature({ secret: SECRET, timestamp, body: '{"amount":101}', signature, now: NOW }), false);
    assert.equal(verifyWebhookSignature({ secret: 'wrong', timestamp, body, signature, now: NOW }), false);
    assert.equal(verifyWebhookSignature({ secret: SECRET, timestamp, body, signature: 'short', now: NOW }), false);
    assert.equal(verifyWebhookSignature({ secret: SECRET, timestamp, body, signature: '', now: NOW }), false);
  });

  it('rejects a timestamp outside the tolerance window', () => {
    const body = '{}';
    const { timestamp, signature } = signWebhookPayload({ secret: SECRET, timestamp: NOW, body });
    const stale = NOW + (DEFAULT_TOLERANCE_SECONDS + 10) * 1000;
    assert.equal(verifyWebhookSignature({ secret: SECRET, timestamp, body, signature, now: stale }), false);
  });

  it('fails closed when no secret is configured', () => {
    assert.equal(getWebhookSigningSecret(), '');
    assert.throws(
      () => signWebhookPayload({ secret: '', timestamp: NOW, body: '{}' }),
      /WEBHOOK_SIGNING_SECRET is not configured/,
    );
  });
});

describe('sendSignedWebhook (#149)', () => {
  const okResponse = { ok: true, status: 200, statusText: 'OK' };

  it('sends the signature and timestamp headers exactly once', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return okResponse;
    };

    const sent = await sendSignedWebhook('https://example.test/hook', { id: 'a' }, {
      secret: SECRET,
      fetchImpl,
      now: NOW,
    });

    assert.equal(sent, true);
    assert.equal(calls.length, 1);
    const headers = calls[0].options.headers;
    assert.equal(headers[SIGNATURE_HEADER], signWebhookPayload({ secret: SECRET, timestamp: NOW, body: calls[0].options.body }).signature);
    assert.equal(headers[TIMESTAMP_HEADER], String(NOW));
    verifyWebhookSignature({
      secret: SECRET,
      timestamp: headers[TIMESTAMP_HEADER],
      body: calls[0].options.body,
      signature: headers[SIGNATURE_HEADER],
      now: NOW,
    });
  });

  it('reads the secret from the environment by default', async () => {
    process.env.WEBHOOK_SIGNING_SECRET = SECRET;
    assert.equal(getWebhookSigningSecret(), SECRET);
    let seen;
    await sendSignedWebhook('https://example.test/hook', {}, {
      fetchImpl: async (_url, options) => {
        seen = options;
        return okResponse;
      },
      now: NOW,
    });
    assert.ok(seen.headers[SIGNATURE_HEADER]);
  });

  it('throws on a non-2xx response instead of retrying internally', async () => {
    let calls = 0;
    await assert.rejects(
      sendSignedWebhook('https://example.test/hook', {}, {
        secret: SECRET,
        now: NOW,
        fetchImpl: async () => {
          calls += 1;
          return { ok: false, status: 503, statusText: 'Service Unavailable' };
        },
      }),
      /Webhook responded 503/,
    );
    assert.equal(calls, 1);
  });

  it('refuses to send an unsigned request', async () => {
    let called = false;
    await assert.rejects(
      sendSignedWebhook('https://example.test/hook', {}, {
        secret: '',
        fetchImpl: async () => { called = true; return okResponse; },
      }),
      /refusing to send unsigned webhook/,
    );
    assert.equal(called, false);
  });
});
