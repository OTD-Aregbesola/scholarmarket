import { getDb } from '@/lib/mongodb';
import { logger } from '@/lib/logger';
import { sendSignedWebhook } from './signing.js';

export async function getDailyStats(db) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const completedStatuses = ['confirmed', 'settled', 'completed'];

  const salesAgg = await (
    await db.collection('purchases').aggregate([
      {
        $match: {
          status: { $in: completedStatuses },
          purchasedAt: { $gte: yesterday, $lte: now },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $toDouble: '$amount' } },
          count: { $sum: 1 },
        },
      },
    ])
  ).toArray();

  const signupsAgg = await (
    await db.collection('users').aggregate([
      {
        $match: {
          createdAt: { $gte: yesterday, $lte: now },
        },
      },
      { $count: 'count' },
    ])
  ).toArray();

  const activeMaterials = await db.collection('materials').countDocuments({
    visibility: { $ne: 'private' },
  });

  return {
    volume: salesAgg[0]?.total ?? 0,
    totalSales: salesAgg[0]?.count ?? 0,
    signups: signupsAgg[0]?.count ?? 0,
    activeMaterials,
  };
}

export { sendSignedWebhook };

/**
 * Backwards-compatible alias. Retries are owned by the outbox, not the
 * sender, so the extra `retries` argument is intentionally ignored.
 */
export async function sendWebhookWithRetry(url, payload) {
  const sent = await sendSignedWebhook(url, payload);
  logger.info(`Webhook sent successfully to ${url}`);
  return sent;
}

import { enqueueSideEffect, WEBHOOK_OUTBOX_CONFIG } from '@/lib/backend/outbox';

export async function broadcastPurchaseEvent(materialId, purchaseData) {
  try {
    const db = await getDb();
    
    // Find the material to get the creatorId
    const material = await db.collection('materials').findOne({ id: materialId });
    if (!material || !material.creatorId) return;

    // Find the creator's webhook URLs
    const creator = await db.collection('users').findOne({ 
      $or: [
        { id: material.creatorId },
        { _id: material.creatorId },
        { walletAddress: material.creatorId }
      ]
    });

    if (!creator || !creator.webhookUrls || !Array.isArray(creator.webhookUrls)) {
      return;
    }

    const payload = {
      event: 'purchase.completed',
      data: {
        materialId,
        buyerAddress: purchaseData.buyerAddress,
        amount: purchaseData.amount,
        asset: purchaseData.asset,
        transactionHash: purchaseData.transactionHash,
        purchasedAt: new Date().toISOString()
      }
    };

    await enqueueSideEffect({
      sourceAggregate: 'material',
      sourceId: String(material._id || materialId),
      intent: {
        type: 'webhook',
        channel: 'purchase.completed',
        payload: {
          urls: creator.webhookUrls,
          payload,
        },
      },
      config: WEBHOOK_OUTBOX_CONFIG,
    });

  } catch (error) {
    logger.error(`Failed to enqueue purchase webhook for material ${materialId}: ${error.message}`);
  }
}
