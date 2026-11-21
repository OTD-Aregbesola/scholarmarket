import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server.js';

/**
 * Only these reads serve identical bytes to every caller. Anything that can
 * include user, entitlement or purchase data must stay private.
 */
export const PUBLIC_READ_ENDPOINTS = Object.freeze([
  'market-materials',
  'subjects',
  'materials-search',
]);

export function isPublicReadEndpoint(endpoint) {
  return PUBLIC_READ_ENDPOINTS.includes(String(endpoint || ''));
}

/** Stable weak ETag over the JSON representation of a response body. */
export function etagFor(body) {
  const serialized = JSON.stringify(body);
  return `W/"${createHash('sha256').update(serialized).digest('base64url')}"`;
}

/** Returns a safe cache policy, defaulting to no-store for unknown scopes. */
export function readCachePolicy({ scope = 'private', endpoint } = {}) {
  if (scope === 'public' && isPublicReadEndpoint(endpoint)) {
    return {
      shared: true,
      cacheControl: 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    };
  }
  return { shared: false, cacheControl: 'private, no-store' };
}

export function shouldSend304(request, etag) {
  const header = request?.headers?.get?.('if-none-match');
  if (!header) return false;
  return header
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === etag || value === '*');
}

/**
 * Serializes a read response with scope-aware cache headers. Public,
 * allowlisted endpoints get a shared ETag; everything else is private.
 */
export function withReadCache(request, body, { scope = 'private', endpoint, status = 200 } = {}) {
  const policy = readCachePolicy({ scope, endpoint });
  const headers = { 'Cache-Control': policy.cacheControl };

  if (!policy.shared) {
    return NextResponse.json(body, { status, headers });
  }

  const etag = etagFor(body);
  if (shouldSend304(request, etag)) {
    return new NextResponse(null, { status: 304, headers: { ...headers, ETag: etag } });
  }

  return NextResponse.json(body, { status, headers: { ...headers, ETag: etag } });
}
