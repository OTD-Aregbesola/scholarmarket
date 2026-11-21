import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  etagFor,
  isPublicReadEndpoint,
  readCachePolicy,
  shouldSend304,
} from '../../src/lib/api/readCache.js';

const requestWith = (ifNoneMatch) => ({
  headers: { get: (name) => (name === 'if-none-match' ? ifNoneMatch : null) },
});

describe('public read cache headers (#158)', () => {
  it('allows only the explicit public endpoint allowlist', () => {
    assert.equal(isPublicReadEndpoint('market-materials'), true);
    assert.equal(isPublicReadEndpoint('subjects'), true);
    assert.equal(isPublicReadEndpoint('materials-search'), true);
    assert.equal(isPublicReadEndpoint('entitlements'), false);
    assert.equal(isPublicReadEndpoint('creator/analytics'), false);
  });

  it('serves shared cache headers for allowlisted public endpoints', () => {
    const policy = readCachePolicy({ scope: 'public', endpoint: 'subjects' });
    assert.equal(policy.shared, true);
    assert.match(policy.cacheControl, /^public,/);
    assert.match(policy.cacheControl, /s-maxage=60/);
  });

  it('fails closed to private for unknown or user-scoped endpoints', () => {
    const unknown = readCachePolicy({ scope: 'public', endpoint: 'entitlements' });
    assert.equal(unknown.shared, false);
    assert.equal(unknown.cacheControl, 'private, no-store');

    const defaultScope = readCachePolicy({ endpoint: 'market-materials' });
    assert.equal(defaultScope.shared, false);
    assert.equal(defaultScope.cacheControl, 'private, no-store');
  });

  it('derives a stable ETag from the body', () => {
    const body = { items: [{ id: 'a' }], total: 1 };
    assert.equal(etagFor(body), etagFor({ items: [{ id: 'a' }], total: 1 }));
    assert.notEqual(etagFor(body), etagFor({ items: [], total: 0 }));
    assert.match(etagFor(body), /^W\/"/);
  });

  it('returns 304 only for a matching ETag or wildcard', () => {
    const etag = etagFor({ ok: true });
    assert.equal(shouldSend304(requestWith(etag), etag), true);
    assert.equal(shouldSend304(requestWith(`"other", ${etag}`), etag), true);
    assert.equal(shouldSend304(requestWith('*'), etag), true);
    assert.equal(shouldSend304(requestWith('"stale"'), etag), false);
    assert.equal(shouldSend304(requestWith(null), etag), false);
  });
});
