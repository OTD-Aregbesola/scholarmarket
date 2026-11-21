export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { withApiHardening } from "@/lib/api/hardening";
import { runHealthProbe } from "@/lib/health/probe";

/**
 * Backward-compatible aggregate health endpoint. The `services` map keeps its
 * original string values; new fields are additive so existing consumers keep
 * working.
 */
export async function GET(request) {
  return withApiHardening(
    request,
    { route: "health-check", rateLimit: { limit: 60, windowMs: 60_000 } },
    async () => {
      const probe = await runHealthProbe();
      return NextResponse.json(
        {
          status: probe.legacyReady ? "healthy" : "unhealthy",
          timestamp: new Date().toISOString(),
          services: probe.legacyServices,
          indexerLag: probe.indexerLag,
          checks: probe.services,
        },
        { status: probe.legacyReady ? 200 : 503 }
      );
    }
  );
}
