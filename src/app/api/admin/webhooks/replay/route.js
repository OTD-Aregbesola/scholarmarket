import { NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/adminAuth';
import { replayDeadLetters } from '@/lib/backend/outbox';
import { auditLog } from '@/lib/api/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Replays dead-lettered side effects. Scoped to webhook intents by default so
 * an admin action cannot accidentally requeue unrelated email or indexer work.
 */
export async function POST(request) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const intentType = typeof body.intentType === 'string' && body.intentType
    ? body.intentType.slice(0, 100)
    : 'webhook';
  const requestedLimit = Number(body.limit);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 500)
    : 100;

  try {
    const replayed = await replayDeadLetters(limit, { intentType });

    auditLog({
      event: 'admin_webhook_replay',
      route: 'admin/webhooks/replay',
      method: 'POST',
      status: 200,
      adminAddress: auth.user?.walletAddress,
      intentType,
      replayed,
    });

    return NextResponse.json({ success: true, intentType, replayed });
  } catch (error) {
    return NextResponse.json({ error: 'Unable to replay dead-lettered deliveries' }, { status: 500 });
  }
}
