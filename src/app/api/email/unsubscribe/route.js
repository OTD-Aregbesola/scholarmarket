import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { withApiHardening } from "@/lib/api/hardening";
import { verifyUnsubscribeToken, UNSUBSCRIBE_CATEGORIES } from "@/lib/email/templates/unsubscribe";

export const runtime = "nodejs";

function confirmationPage(label) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"/><title>Unsubscribed</title></head>
<body style="font-family:sans-serif;max-width:560px;margin:48px auto;padding:24px;color:#111827;">
  <h1>You're unsubscribed</h1>
  <p>You will no longer receive ${label} emails from ScholarMarket.</p>
</body>
</html>`;
}

function categoryLabel(category) {
  return category === UNSUBSCRIBE_CATEGORIES.REMINDERS ? "inactivity reminder" : "product update";
}

/**
 * Verifies the signed token and opts the recipient out of a single
 * non-transactional category without requiring a login.
 */
async function processUnsubscribe(request, logger) {
  const token = request.nextUrl.searchParams.get("token");
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    logger.warn("Invalid unsubscribe token");
    return NextResponse.json({ error: "Invalid or expired unsubscribe link" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const email = payload.email;
    const user = await db.collection("users").findOne({
      $or: [{ email }, { emailLower: email.toLowerCase() }],
    });

    if (user) {
      const current = user.notificationPreferences || {};
      await db.collection("users").updateOne(
        { _id: user._id },
        {
          $set: {
            notificationPreferences: { ...current, [payload.category]: false },
            notificationPreferencesUpdatedAt: new Date(),
          },
        }
      );
      logger.info({ category: payload.category }, "Processed unsubscribe");
    }

    return new NextResponse(confirmationPage(categoryLabel(payload.category)), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to process unsubscribe");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(request) {
  return withApiHardening(request, { route: "email_unsubscribe", rateLimit: { limit: 20, windowMs: 60_000 } }, (logger) =>
    processUnsubscribe(request, logger)
  );
}

/** RFC 8058 one-click POST, used by List-Unsubscribe-Post. */
export async function POST(request) {
  return withApiHardening(request, { route: "email_unsubscribe_post", rateLimit: { limit: 20, windowMs: 60_000 } }, async (logger) => {
    const body = await request.text();
    if (!body.includes("List-Unsubscribe=One-Click")) {
      return NextResponse.json({ error: "Invalid one-click request" }, { status: 400 });
    }
    return processUnsubscribe(request, logger);
  });
}
