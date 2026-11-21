import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyRevision,
  buildRevisionRecord,
  currentFileOf,
  normalizeRevisionHistory,
  resolveRevisionCid,
  withRevisionHistory,
} from '../../src/lib/materials/revisions.js';

const NOW = new Date('2026-11-20T12:00:00.000Z');

describe('material revision history (#146)', () => {
  it('seeds a legacy material with its current file', () => {
    const revisions = normalizeRevisionHistory({
      cid: 'old-cid',
      size: 100,
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
    }, NOW);
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].cid, 'old-cid');
    assert.equal(revisions[0].id, 'rev-1');
  });

  it('keeps the canonical top-level file in sync with the new revision', () => {
    const material = { cid: 'old-cid', storageKey: 'old-cid', title: 'Notes', userAddress: 'GBUYER', price: 10 };
    const result = applyRevision({
      material,
      file: { cid: 'new-cid', size: 200, contentType: 'application/pdf' },
      changelog: 'Fixed chapter 3',
      now: NOW,
    });

    assert.equal(result.updates.cid, 'new-cid');
    assert.equal(result.updates.ipfsCid, 'new-cid');
    assert.equal(result.updates.storageKey, 'new-cid');
    assert.equal(result.revisions.length, 2);
    assert.equal(result.revisions[1].changelog, 'Fixed chapter 3');
  });

  it('never includes entitlement or ownership fields in the write set', () => {
    const material = { cid: 'old-cid', userAddress: 'GOWNER', price: 10, entitlementIds: ['a'] };
    const { updates } = applyRevision({
      material,
      file: { cid: 'new-cid' },
      now: NOW,
    });
    for (const key of ['userAddress', 'price', 'entitlementIds', '_id', 'materialId']) {
      assert.equal(Object.hasOwn(updates, key), false, `unexpected ${key}`);
    }
  });

  it('rejects a revision without a CID', () => {
    assert.throws(
      () => applyRevision({ material: {}, file: {}, now: NOW }),
      /file CID is required/,
    );
  });

  it('enforces the revision limit', () => {
    const revisions = Array.from({ length: 50 }, (_, index) => buildRevisionRecord(
      { cid: `cid-${index}` },
      { index, now: NOW },
    ));
    assert.throws(
      () => applyRevision({ material: { revisions }, file: { cid: 'extra' }, now: NOW }),
      /Revision limit/,
    );
  });
});

describe('revision selection (#146)', () => {
  const material = {
    cid: 'latest-cid',
    revisions: [
      buildRevisionRecord({ cid: 'v1', size: 10 }, { index: 0, now: NOW }),
      buildRevisionRecord({ cid: 'v2', size: 20 }, { index: 1, now: NOW, changelog: 'Second' }),
    ],
  };

  it('uses the top-level file by default and for latest', () => {
    assert.equal(resolveRevisionCid(material).cid, 'latest-cid');
    assert.equal(resolveRevisionCid(material, 'latest').cid, 'latest-cid');
  });

  it('resolves zero-based numeric indexes', () => {
    assert.equal(resolveRevisionCid(material, '0').cid, 'v1');
    assert.equal(resolveRevisionCid(material, '1').cid, 'v2');
  });

  it('resolves stable revision ids', () => {
    assert.equal(resolveRevisionCid(material, 'rev-1').cid, 'v1');
    assert.equal(resolveRevisionCid(material, 'rev-2').cid, 'v2');
  });

  it('returns null for unknown selectors', () => {
    assert.equal(resolveRevisionCid(material, '99'), null);
    assert.equal(resolveRevisionCid(material, 'nope'), null);
  });

  it('exposes the canonical file through currentFileOf', () => {
    assert.deepEqual(currentFileOf({ ipfsCid: 'ipfs', sizeBytes: 5, mimeType: 'text/plain' }), {
      cid: 'ipfs',
      storageKey: 'ipfs',
      size: 5,
      contentType: 'text/plain',
      fileName: null,
    });
  });

  it('exposes revisions as an array in API responses', () => {
    assert.deepEqual(withRevisionHistory({ title: 'No revisions yet' }).revisions, []);
    assert.equal(withRevisionHistory(material).revisions.length, 2);
  });
});
