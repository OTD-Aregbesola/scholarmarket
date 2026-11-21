import { NextResponse } from "next/server";
import { getFlag, listPublicFlags } from "@/lib/features/flags";

export async function GET(request) {
  const flags = await listPublicFlags();
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ flags });
  const publicFlag = flags.find((flag) => flag.key === key);
  if (!publicFlag) return NextResponse.json({ flags: [] });
  const enabled = await getFlag(key, { walletAddress: searchParams.get("walletAddress") || undefined });
  return NextResponse.json({ flags: [{ ...publicFlag, enabled }] });
}
