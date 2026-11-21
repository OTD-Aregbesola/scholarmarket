import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { auditLog } from "@/lib/api/audit";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import { clearFlagCache } from "@/lib/features/flags";

export async function GET(request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
  const db = await getDb();
  const flags = await db.collection("feature_flags").find({}).project({ _id: 0 }).toArray();
  return NextResponse.json({ flags });
}

export async function PATCH(request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
  const body = await request.json();
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(key)) return NextResponse.json({ error: "Valid flag key is required" }, { status: 400 });
  const update = {
    enabled: Boolean(body.enabled),
    rolloutPercent: Math.max(0, Math.min(100, Number(body.rolloutPercent || 0))),
    allowlist: Array.isArray(body.allowlist) ? body.allowlist.filter((value) => typeof value === "string").slice(0, 1000) : [],
    public: Boolean(body.public),
    updatedAt: new Date(),
  };
  const db = await getDb();
  await db.collection("feature_flags").updateOne({ key }, { $set: { key, ...update } }, { upsert: true });
  clearFlagCache();
  auditLog({ event: "feature_flag_updated", route: "admin/flags", method: "PATCH", status: 200, actor: auth.user?.sub, target: key });
  return NextResponse.json({ key, ...update });
}
