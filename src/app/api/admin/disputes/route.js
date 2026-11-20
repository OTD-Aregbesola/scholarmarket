export const dynamic = "force-dynamic";
import { logger } from "@/lib/logger";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import { auditLog } from "@/lib/api/audit";
import { paginate } from "@/lib/pagination/cursor";

export async function GET(request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limit = url.searchParams.get("limit");

    const db = await getDb();
    const page = await paginate({
      collection: db.collection("disputes"),
      filter: {},
      sort: { createdAt: -1, _id: -1 },
      cursor,
      limit,
    });

    return NextResponse.json({ items: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore });
  } catch (error) {
    if (error.code === "INVALID_CURSOR") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error("[admin/disputes] GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { disputeId, status, resolution } = await request.json();
    if (!disputeId || !status) {
      return NextResponse.json({ error: "disputeId and status are required" }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection("disputes").updateOne(
      { _id: disputeId },
      {
        $set: {
          status,
          resolution: resolution ?? null,
          resolvedBy: user.sub,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    auditLog({
      event: "admin_dispute_resolved",
      route: "admin/disputes",
      method: "PATCH",
      status: 200,
      actor: user.sub || user.walletAddress,
      disputeId,
      newStatus: status,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[admin/disputes] PATCH error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
