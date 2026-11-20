export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

/** Liveness: proves the Node process is running. No dependency calls here. */
export async function GET() {
  return NextResponse.json(
    { status: 'alive', timestamp: new Date().toISOString() },
    { status: 200 },
  );
}
