import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { endOpenSessions } from '@/lib/practiceSessions';

/**
 * Closes the caller's open practice sessions (PLAN.md §16 defect 1).
 *
 * Called via `navigator.sendBeacon` on page leave, which means: no request body
 * worth parsing, no response anybody reads, and a Content-Type we don't control
 * (sendBeacon sends text/plain for a string payload). So this route takes no
 * input at all - the user is identified by their session cookie, which sendBeacon
 * does send. Idempotent: closing already-closed sessions is a no-op.
 *
 * A missed beacon is not a failure mode worth worrying about; the idle timeout in
 * getOrCreateSession is the real backstop.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }

  await endOpenSessions(session.user.id);
  return NextResponse.json({ ok: true });
}
