import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { endSession } from '@/lib/sessions';
import { sessionEndRequestSchema } from '@/lib/zodSchemas';

/**
 * PLAN.md §16 defect 1: explicit session close-out.
 *
 * Called via `navigator.sendBeacon` when the learner leaves the practice page.
 * sendBeacon cannot set headers, so the body arrives as text/plain rather than JSON -
 * parse the raw text instead of trusting `request.json()`. Cookies ARE sent on a
 * same-origin beacon, so the normal auth check still applies.
 *
 * Best-effort by design: mobile browsers discard beacons freely. The guarantee lives
 * in the idle sweep in lib/sessions.ts, not here.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }

  const raw = await request.text().catch(() => '');
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'validation_error' },
      { status: 400 },
    );
  }

  const parsed = sessionEndRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'validation_error' },
      { status: 400 },
    );
  }

  // Scoped to the caller inside endSession, so a session id belonging to someone else
  // silently does nothing rather than ending their practice.
  await endSession(session.user.id, parsed.data.sessionId);

  return new NextResponse(null, { status: 204 });
}
