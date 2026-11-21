/**
 * Material file revisions. The top-level material fields remain the canonical
 * (latest) file. `revisions[]` holds the full history, including the current
 * version, so older buyers can still fetch earlier files without repurchasing.
 */

export const REVISION_LIMIT = 50;

/** Extracts the canonical file reference from a material document. */
export function currentFileOf(material = {}) {
  return {
    cid: material.ipfsCid ?? material.cid ?? material.fileHash ?? material.storageKey ?? material.fileUrl ?? null,
    storageKey: material.storageKey ?? material.cid ?? material.ipfsCid ?? material.fileHash ?? null,
    size: Number(material.size ?? material.sizeBytes ?? 0),
    contentType: material.contentType ?? material.mimeType ?? 'application/octet-stream',
    fileName: material.fileName ?? material.title ?? null,
  };
}

function toIso(value, now) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || (typeof value === 'string' && !Number.isNaN(Date.parse(value)))) {
    return new Date(value).toISOString();
  }
  return now.toISOString();
}

/** Creates one normalized revision record. */
export function buildRevisionRecord(file = {}, { index = 0, changelog = '', now = new Date() } = {}) {
  return {
    id: `rev-${index + 1}`,
    index,
    cid: file.cid || file.storageKey || null,
    size: Number(file.size ?? file.sizeBytes ?? 0),
    changelog: String(changelog || '').slice(0, 2000),
    contentType: file.contentType || 'application/octet-stream',
    fileName: file.fileName || null,
    createdAt: toIso(file.createdAt, now),
  };
}

/**
 * Seeds revision history for legacy materials, or normalizes an existing one.
 * Legacy materials get their current file as revision 1.
 */
export function normalizeRevisionHistory(material = {}, now = new Date()) {
  const existing = Array.isArray(material.revisions) ? material.revisions : [];
  if (existing.length > 0) {
    return existing.map((revision, index) => buildRevisionRecord(
      { ...revision, cid: revision.cid ?? revision.storageKey },
      { index, changelog: revision.changelog, now },
    ));
  }

  const file = currentFileOf(material);
  if (!file.cid) return [];
  return [buildRevisionRecord({ ...file, createdAt: material.updatedAt || material.createdAt }, { index: 0, now })];
}

/**
 * Computes the write set for a new revision. Entitlement and ownership fields
 * are deliberately never included, so publishing a file cannot revoke access.
 */
export function applyRevision({ material = {}, file = {}, changelog = '', now = new Date() } = {}) {
  const cid = file.cid || file.storageKey || null;
  if (!cid) throw new Error('A file CID is required to publish a revision');

  const revisions = normalizeRevisionHistory(material, now);
  if (revisions.length >= REVISION_LIMIT) {
    throw new Error(`Revision limit of ${REVISION_LIMIT} reached`);
  }

  const next = buildRevisionRecord(
    { ...file, cid, createdAt: now },
    { index: revisions.length, changelog, now },
  );

  return {
    revision: next,
    revisions: [...revisions, next],
    updates: {
      cid,
      ipfsCid: cid,
      storageKey: file.storageKey || cid,
      size: Number(file.size ?? file.sizeBytes ?? 0),
      contentType: file.contentType || 'application/octet-stream',
      fileName: file.fileName || material.fileName || material.title || null,
      revisions: [...revisions, next],
      updatedAt: now,
    },
  };
}

/**
 * Resolves a revision selector to a file CID. An absent or `latest` selector
 * uses the canonical top-level file. Numeric strings are zero-based indexes;
 * other strings match a revision id.
 */
export function resolveRevisionCid(material = {}, selector) {
  const current = currentFileOf(material).cid;
  if (selector === undefined || selector === null || selector === '' || selector === 'latest') {
    return { cid: current, revision: null, index: null };
  }

  const revisions = normalizeRevisionHistory(material);
  const asIndex = String(selector).match(/^\d+$/)
    ? Number(selector)
    : (String(selector).match(/^rev-(\d+)$/) || [])[1];
  const index = asIndex === undefined ? -1 : Number(asIndex) - (String(selector).startsWith('rev-') ? 1 : 0);

  const revision = index >= 0 ? revisions[index] : revisions.find((item) => item.id === selector);
  if (!revision?.cid) return null;

  return { cid: revision.cid, revision, index: revision.index ?? index };
}

/** Exposes `revisions` as an array in API responses, including legacy docs. */
export function withRevisionHistory(material) {
  if (!material) return material;
  return { ...material, revisions: normalizeRevisionHistory(material) };
}
