import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { closeOpenSessions } from '@/lib/sessions';
import { sessionEndRequestSchema } from '@/lib/zodSchemas';

// PLAN.md §16 defect 1, explicit half: the learner left, so close the practice session
// they were in. Reached by `navigator.sendBeacon` (see `useSessionEndBeacon`), which
// cannot read a response - so this route is written to be safe to call blindly: it takes
// no session id, re-resolving "this caller's open session for this pair+mode" server-side
// the same way `getOrCreateSession` does, and closing nothing is a normal outcome.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }
  if (!session.user.languagePairId) {
    // No pair means no session was ever opened; nothing to close, and not an error.
    return NextResponse.json({ closed: 0 });
  }

  const body = await request.json().catch(() => null);
  const parsed = sessionEndRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'validation_error', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const closed = await closeOpenSessions({
    userId: session.user.id,
    languagePairId: session.user.languagePairId,
    mode: parsed.data.mode,
    lessonId: parsed.data.lessonId ?? null,
  });

  return NextResponse.json({ closed });
}
