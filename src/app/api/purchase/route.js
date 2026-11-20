export const dynamic = "force-dynamic";

import { getDb } from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { getUserFromCookie } from "@/lib/api/auth";
import { createEntitlement } from '@/lib/entitlement';
import {
  getMaterialAccessStatus,
  isCompletedPurchaseStatus,
  normalizeBuyerAddress,
} from "@/lib/purchases/access";
import { logger } from "@/lib/logger";
import { broadcastPurchaseEvent } from '@/lib/webhooks/sender';
import { sendReceiptIfEligible } from '@/lib/email';
import { withApiHardening } from "@/lib/api/hardening";
import { API_RATE_LIMITS } from "@/lib/api/rateLimitConfig";
import { withRequestLogger } from "@/lib/logger";
import { paginate } from "@/lib/pagination/cursor";


/**
 * GET /api/purchase
 *
 * List all purchases for the authenticated user.
 *
 * @swagger
 * /api/purchase:
 *   get:
 *     summary: List current user's purchases
 *     tags: [Purchases]
 *     description: Returns all purchase records for the authenticated user, sorted by creation date.
 *     responses:
 *       200:
 *         description: Array of purchase records
 *       401:
 *         description: Unauthorized
 */
export const GET = withRequestLogger(async function GET(req, context, requestLogger) {
  return withApiHardening(req, {
    route: "/api/purchase",
    rateLimit: API_RATE_LIMITS["/api/purchase"],
  }, async () => {
  try {
    const user = await getUserFromCookie(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const limit = url.searchParams.get("limit");

    const db = await getDb();
    const userAddress = normalizeBuyerAddress(user.walletAddress || user.address || user.id);

    const page = await paginate({
      collection: db.collection("purchases"),
      filter: { buyerAddress: userAddress },
      sort: { createdAt: -1, _id: -1 },
      cursor,
      limit,
    });

    return NextResponse.json({ items: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore });
  } catch (err) {
    if (err.code === "INVALID_CURSOR") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    requestLogger.error({ err }, "GET /api/purchase error");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  });
});

/**
 * POST /api/purchase
 *
 * Purchase a material. Creates or confirms a purchase record.
 * If payment details (transactionHash or signedXdr) are provided, the purchase
 * is marked as confirmed immediately. Otherwise it enters a pending state.
 *
 * @swagger
 * /api/purchase:
 *   post:
 *     summary: Purchase a material
 *     tags: [Purchases]
 *     description: Initiates or confirms a purchase of an educational material.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePurchaseRequest'
 *     responses:
 *       200:
 *         description: Purchase already completed
 *       201:
 *         description: New confirmed purchase
 *       202:
 *         description: Purchase pending
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
export const POST = withRequestLogger(async function POST(req, context, requestLogger) {
  return withApiHardening(req, {
    route: "/api/purchase",
    rateLimit: API_RATE_LIMITS["/api/purchase"],
  }, async () => {
  try {
    const user = await getUserFromCookie(req);
    const db = await getDb();
    const body = await req.json();

    const { materialId, signedXdr, email, transactionHash, amount, asset, buyerAddress: bodyBuyerAddress } = body;
    const buyerAddress = normalizeBuyerAddress(
      user?.walletAddress || user?.address || user?.id || bodyBuyerAddress
    );
    const paymentCompleted = Boolean(transactionHash || signedXdr);

    if (!materialId) {
      return NextResponse.json({ error: "Missing materialId" }, { status: 400 });
    }

    if (!buyerAddress) {
      return NextResponse.json({ error: user ? "Missing buyer address" : "Unauthorized" }, { status: user ? 400 : 401 });
    }

    // Prevent duplicate purchases
    const existing = await db
      .collection('purchases')
      .findOne({ buyerAddress, materialId });
    if (existing) {
      if (isCompletedPurchaseStatus(existing.status)) {
        await createEntitlement(materialId, buyerAddress, {
          purchaseId: String(existing._id),
          transactionHash: existing.transactionHash,
        });
        const access = await getMaterialAccessStatus(db, materialId, buyerAddress);
        return NextResponse.json(
          { message: 'Already purchased', purchase: existing, access, transactionHash: existing.transactionHash },
          { status: 200 }
        );
      }

      if (!paymentCompleted) {
        const access = await getMaterialAccessStatus(db, materialId, buyerAddress);
        return NextResponse.json(
          { message: 'Payment pending', purchase: existing, access },
          { status: 202 }
        );
      }

      const now = new Date();
      await db.collection('purchases').updateOne(
        { _id: existing._id },
        {
          $set: {
            status: 'confirmed',
            transactionHash: transactionHash || existing.transactionHash || null,
            signedXdr: signedXdr || existing.signedXdr || null,
            amount: amount ?? existing.amount ?? null,
            asset: asset || existing.asset || null,
            userEmail: email || existing.userEmail || null,
            purchasedAt: existing.purchasedAt || now,
            confirmedAt: now,
            updatedAt: now,
          },
        }
      );

      const purchase = await db.collection('purchases').findOne({ _id: existing._id });
      const access = await getMaterialAccessStatus(db, materialId, buyerAddress);

      if (paymentCompleted) {
        sendReceiptIfEligible(db, existing._id).catch(err => logger.error(err));
        // Fire webhook asynchronously
        broadcastPurchaseEvent(materialId, {
          buyerAddress,
          amount: amount ?? existing.amount,
          asset: asset || existing.asset,
          transactionHash: transactionHash || existing.transactionHash
        });
      }

      return NextResponse.json(
        { success: true, purchaseId: existing._id, purchase, access, transactionHash: purchase?.transactionHash },
        { status: 200 }
      );
    }

    const now = new Date();

    const purchaseRecord = {
      materialId,
      buyerAddress,
      userEmail: email || null,
      status: paymentCompleted ? 'confirmed' : 'pending',
      transactionHash: transactionHash || null,
      signedXdr: signedXdr || null,
      amount: amount ?? null,
      asset: asset || null,
      purchasedAt: paymentCompleted ? now : null,
      confirmedAt: paymentCompleted ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('purchases').insertOne(purchaseRecord);
    const access = await getMaterialAccessStatus(db, materialId, buyerAddress);

    if (paymentCompleted) {
      await createEntitlement(materialId, buyerAddress, {
        purchaseId: String(result.insertedId),
        transactionHash: transactionHash || null,
      });

      sendReceiptIfEligible(db, result.insertedId).catch(err => logger.error(err));

      // Fire webhook asynchronously
      broadcastPurchaseEvent(materialId, purchaseRecord);
    }

    return NextResponse.json(
      { success: paymentCompleted, purchaseId: result.insertedId, purchase: { ...purchaseRecord, _id: result.insertedId }, access },
      { status: paymentCompleted ? 201 : 202 }
    );
  } catch (err) {
    requestLogger.error({ err }, "POST /api/purchase error");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  });
});
