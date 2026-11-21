import { getDb } from '@/lib/mongodb';
import { pinata } from '@/lib/pinata';
import { auditLog } from '@/lib/api/audit';
import { normalizeStringList, sanitizeObject } from '@/lib/api/validation';

/**
 * Retry schedule for failed pins (exponential backoff).
 *
 * - Up to MAX_PIN_ATTEMPTS = 5 attempts in total.
 * - After failed attempt n the job waits RETRY_BASE_DELAY_MS * 2^(n - 1):
 *   1 min, 2 min, 4 min, 8 min.
 * - The 5th failed attempt is terminal: status becomes 'failed' and the job
 *   is never picked up again.
 * - A job is claimed by setting status 'processing' and lockedAt. If the worker
 *   stops before it records a result, the job is picked up again once the lock
 *   is older than STALE_LOCK_MS (15 min). This does not count as an attempt.
 */
export const MAX_PIN_ATTEMPTS = 5;
export const RETRY_BASE_DELAY_MS = 60_000;
export const STALE_LOCK_MS = 15 * 60_000;

export function getRetryDelayMs(attempt) {
  return RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

/**
 * @param {{ db?: import('mongodb').Db }} [options] optional db override (used by tests)
 */
export async function processPendingPins({ db: injectedDb } = {}) {
  try {
    const db = injectedDb || await getDb();
    const pendingCollection = db.collection('pending_pins');
    const now = new Date();
    
    const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);

    // Find up to 10 pins that are due for an attempt, or whose claim has gone stale
    const pendingItems = await pendingCollection
      .find({
        $or: [
          { status: 'pending', nextAttemptAt: { $exists: false } },
          { status: 'pending', nextAttemptAt: { $lte: now } },
          { status: 'processing', lockedAt: { $lte: staleBefore } },
        ],
      })
      .limit(10)
      .toArray();
    
    for (const listed of pendingItems) {
      // Claim the job atomically so concurrent workers skip it. A stale claim is
      // matched on its old lockedAt, so only one worker can take it over.
      const claimFilter = listed.status === 'processing'
        ? { _id: listed._id, status: 'processing', lockedAt: listed.lockedAt }
        : { _id: listed._id, status: 'pending' };
      const claimed = await pendingCollection.findOneAndUpdate(
        claimFilter,
        { $set: { status: 'processing', lockedAt: new Date() } },
      );
      // mongodb v6+ returns the document; older drivers return { value }
      const item = claimed && 'value' in claimed && !('_id' in claimed) ? claimed.value : claimed;
      if (!item) continue;

      try {
        const results = {};

        // 1. Upload File
        if (item.fileData) {
          // BSON Binary type has a buffer property
          const buffer = item.fileData.buffer;
          const fileBlob = new Blob([buffer], { type: item.fileType });
          const file = new File([fileBlob], item.fileName || 'file', { type: item.fileType });
          const uploadedFile = await pinata.upload.public.file(file);
          results.fileUrl = await pinata.gateways.public.convert(uploadedFile.cid);
          results.storageKey = uploadedFile.cid;
        }

        // 2. Upload Thumbnail
        if (item.imageData) {
          const buffer = item.imageData.buffer;
          const imgBlob = new Blob([buffer], { type: item.imageType });
          const image = new File([imgBlob], item.imageName || 'thumbnail', { type: item.imageType });
          const fileThumb = await pinata.upload.public.file(image);
          results.imgUrl = await pinata.gateways.public.convert(fileThumb.cid);
        }

        // 3. Construct Metadata
        const otherFields = item.otherFields || {};
        const previewInputs = {
          learningOutcomes: otherFields.learningOutcomes,
          tableOfContents: otherFields.tableOfContents,
          sampleNotes: otherFields.sampleNotes,
        };
        const scalarFields = { ...otherFields };
        delete scalarFields.learningOutcomes;
        delete scalarFields.tableOfContents;
        delete scalarFields.sampleNotes;
        
        const sanitizedScalarFields = sanitizeObject(scalarFields, {
          title: 160,
          description: 5000,
          shortSummary: 280,
          usageRights: 1000,
          coverImageUrl: 2048,
          thumbnailUrl: 2048,
        });

        const metadataJSON = {
          name: sanitizedScalarFields.title || sanitizedScalarFields.name || "",
          description: sanitizedScalarFields.description || "",
          image: results.imgUrl || null,
          properties: {
            ...sanitizedScalarFields,
            coverImageUrl: results.imgUrl || sanitizedScalarFields.coverImageUrl || null,
            thumbnailUrl: results.imgUrl || sanitizedScalarFields.thumbnailUrl || null,
            learningOutcomes: normalizeStringList(previewInputs.learningOutcomes, {
              maxItems: 8,
              maxLength: 180,
            }),
            tableOfContents: normalizeStringList(previewInputs.tableOfContents, {
              maxItems: 16,
              maxLength: 180,
            }),
            sampleNotes: normalizeStringList(previewInputs.sampleNotes, {
              maxItems: 6,
              maxLength: 280,
            }),
            storageKey: results.storageKey,
            fileUrl: results.fileUrl,
            timestamp: new Date().toISOString(),
          },
          ...sanitizedScalarFields,
          coverImageUrl: results.imgUrl || sanitizedScalarFields.coverImageUrl || null,
          thumbnailUrl: results.imgUrl || sanitizedScalarFields.thumbnailUrl || null,
          learningOutcomes: normalizeStringList(previewInputs.learningOutcomes, {
            maxItems: 8,
            maxLength: 180,
          }),
          tableOfContents: normalizeStringList(previewInputs.tableOfContents, {
            maxItems: 16,
            maxLength: 180,
          }),
          sampleNotes: normalizeStringList(previewInputs.sampleNotes, {
            maxItems: 6,
            maxLength: 280,
          }),
          storageKey: results.storageKey,
          fileUrl: results.fileUrl,
          image: results.imgUrl || null,
          timestamp: new Date().toISOString(),
        };

        const uploadedJson = await pinata.upload.public.json(metadataJSON);
        results.metadataUrl = await pinata.gateways.public.convert(uploadedJson.cid);

        // Update DB
        await pendingCollection.updateOne(
          { _id: item._id },
          { 
            $set: { 
              status: 'completed', 
              completedAt: new Date(), 
              results 
            } 
          }
        );

        auditLog({
          event: 'retry_upload_success',
          route: 'worker',
          method: 'CRON',
          status: 200,
          reason: `Uploaded pending pin ${item._id}`,
        });

      } catch (err) {
        console.error(`Failed to process pending pin ${item._id}`, err);
        const attempts = (item.attempts || 0) + 1;
        const failedAt = new Date();
        if (attempts >= MAX_PIN_ATTEMPTS) {
          await pendingCollection.updateOne(
            { _id: item._id },
            { $set: { status: 'failed', attempts, failedAt, lastError: err.message } }
          );
          auditLog({
            event: 'retry_upload_gave_up',
            route: 'worker',
            method: 'CRON',
            status: 500,
            reason: `Gave up on pending pin ${item._id} after ${attempts} attempts`,
          });
        } else {
          await pendingCollection.updateOne(
            { _id: item._id },
            {
              $set: {
                status: 'pending',
                attempts,
                lastError: err.message,
                nextAttemptAt: new Date(failedAt.getTime() + getRetryDelayMs(attempts)),
              },
            }
          );
        }
        auditLog({
          event: 'retry_upload_failed',
          route: 'worker',
          method: 'CRON',
          status: 500,
          reason: err.message,
        });
      }
    }
  } catch (err) {
    console.error('Failed to run processPendingPins worker', err);
  }
}
