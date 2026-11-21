export const dynamic = "force-dynamic";

import { getDb } from "@/lib/mongodb";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { withApiHardening } from "@/lib/api/hardening";
import { auditLog } from "@/lib/api/audit";
import { getUserFromCookie } from "@/lib/api/auth";
import { COMPLETED_PURCHASE_STATUSES, normalizeBuyerAddress } from "@/lib/purchases/access";
import { paginate } from "@/lib/pagination/cursor";

/**
 * GET /api/purchased-materials
 * Returns all materials the authenticated user has a confirmed on-chain entitlement for.
 * Each item includes the purchase record merged with the material metadata.
 */
export async function GET(request) {
  return withApiHardening(
    request,
    { route: "purchased-materials", rateLimit: { limit: 60, windowMs: 60_000 } },
    async () => {
      const user = await getUserFromCookie(request);
      if (!user) {
        auditLog({ event: "auth_failed", route: "purchased-materials", method: "GET", status: 401 });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const buyerAddress = normalizeBuyerAddress(user.walletAddress || user.address || user.id);
      if (!buyerAddress) {
        return NextResponse.json({ error: "No wallet address on account" }, { status: 400 });
      }

      const { searchParams } = new URL(request.url);
      const cursor = searchParams.get("cursor");
      const limit = searchParams.get("limit");

      const db = await getDb();

      // Paginate confirmed purchases first so the material lookup stays bounded
      // to at most one page of IDs regardless of collection size.
      let page;
      try {
        page = await paginate({
          collection: db.collection("purchases"),
          filter: { buyerAddress, status: { $in: [...COMPLETED_PURCHASE_STATUSES] } },
          sort: { purchasedAt: -1, createdAt: -1, _id: -1 },
          cursor,
          limit,
        });
      } catch (err) {
        if (err.code === "INVALID_CURSOR") {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }

      // Resolve only this page's material IDs, guarding against malformed entries.
      const materialIds = page.items
        .map((p) => {
          try {
            return ObjectId.isValid(p.materialId) ? new ObjectId(p.materialId) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const materials = materialIds.length
        ? await db.collection("materials").find({ _id: { $in: materialIds } }).toArray()
        : [];

      const materialMap = Object.fromEntries(
        materials.map((m) => [m._id.toString(), m])
      );

      // Merge purchase record with material metadata; strip sensitive storage fields.
      const items = page.items.map((purchase) => {
        const material = materialMap[purchase.materialId] || null;
        const base = {
          purchaseId: purchase._id,
          materialId: purchase.materialId,
          purchasedAt: purchase.purchasedAt,
          transactionHash: purchase.transactionHash,
        };
        if (!material) return { ...base, material: null };

        const { storageKey, fileUrl, metadataUrl, ...safeMaterial } = material;
        return { ...base, material: safeMaterial };
      });

      auditLog({ event: "purchased_materials_listed", route: "purchased-materials", method: "GET", status: 200, actor: user.sub });
      return NextResponse.json({ items, nextCursor: page.nextCursor, hasMore: page.hasMore });
    }
  );
}
