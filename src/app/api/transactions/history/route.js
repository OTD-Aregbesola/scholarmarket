export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getUserFromCookie } from "@/lib/api/auth";
import {
  buildPurchaseHistoryRecords,
  fetchHorizonTransactions,
} from "@/lib/transactions/historyFeed";
import { logger } from "@/lib/logger";
import { paginate } from "@/lib/pagination/cursor";

// On-chain activity is merged into the first page only, as a bounded recent
// window. MongoDB purchase records are the paginated source of truth; Horizon
// has no seek cursor here, so deeper on-chain history is intentionally not
// paginated. This keeps pages stable while exposing recent chain activity.
const ONCHAIN_WINDOW = 20;

export async function GET(request) {
  try {
    const user = await getUserFromCookie(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const buyerAddress = user.walletAddress || user.address || user.id;
    if (!buyerAddress) {
      return NextResponse.json({ error: "No wallet address on account" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const limit = searchParams.get("limit");

    const db = await getDb();
    const buyerAddressLower = String(buyerAddress).toLowerCase();
    const purchaseFilter = {
      $or: [{ buyerAddress }, { buyerAddress: buyerAddressLower }],
    };

    const page = await paginate({
      collection: db.collection("purchases"),
      filter: purchaseFilter,
      sort: { purchasedAt: -1, createdAt: -1, _id: -1 },
      cursor,
      limit,
      transform: (purchase) => buildPurchaseHistoryRecords([purchase])[0],
    });

    let items = page.items;
    if (!cursor) {
      const onchain = await fetchHorizonTransactions(String(buyerAddress), {
        page: 1,
        limit: ONCHAIN_WINDOW,
      });
      const purchaseHashes = new Set(items.map((entry) => entry.hash).filter(Boolean));
      const uniqueOnchain = onchain.records.filter(
        (entry) => !entry.hash || !purchaseHashes.has(entry.hash),
      );
      items = [...items, ...uniqueOnchain].sort((a, b) => {
        const left = new Date(a.createdAt || 0).getTime();
        const right = new Date(b.createdAt || 0).getTime();
        return right - left;
      });
    }

    return NextResponse.json({
      items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
  } catch (error) {
    if (error.code === "INVALID_CURSOR") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error("Transaction history error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
