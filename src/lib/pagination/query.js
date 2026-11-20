/**
 * Client-safe helper for building cursor pagination query strings.
 *
 * Kept separate from cursor.js so browser bundles never pull in the MongoDB
 * driver just to append `cursor` and `limit` to a request URL.
 */
export function cursorQuery(cursor, limit) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", String(cursor));
  if (limit !== undefined && limit !== null) params.set("limit", String(limit));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** TanStack Query `getNextPageParam` for the standardized page response. */
export function nextCursorParam(page) {
  return page?.nextCursor ?? undefined;
}
