export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withApiHardening } from '@/lib/api/hardening';
import { runHealthProbe } from '@/lib/health/probe';

/** Readiness: proves every required dependency, including Redis, is usable. */
export async function GET(request) {
  return withApiHardening(
    request,
    { route: 'health-ready', rateLimit: { limit: 60, windowMs: 60_000 } },
    async () => {
      const probe = await runHealthProbe();
      return NextResponse.json(
        {
          status: probe.ready ? 'ready' : 'not_ready',
          timestamp: new Date().toISOString(),
          indexerLag: probe.indexerLag,
          services: probe.services,
        },
        { status: probe.ready ? 200 : 503 },
      );
    },
  );
}
