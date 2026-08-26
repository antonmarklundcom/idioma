import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logUsage } from '@/lib/usage';
import { speakingTimeRequestSchema } from '@/lib/zodSchemas';

// Speaking time from practice that never becomes a graded turn (ROADMAP.md P1.5b
// follow-on). Shadowing is the whole reason this exists: it is ungraded on purpose -
// no model call, no attempt row, no quota - which also meant nothing about it ever
// reached the server, so the minutes people spend on it were invisible.
//
// This route writes ONE thing: a `speaking_seconds` row in `usage_log`, the same row
// /api/lesson/attempt writes for a graded turn. Deliberately nothing else - no XP, no
// streak, no practice session, no daily-goal turn. Shadowing is worth doing twenty
// times in a row precisely because it costs nothing, and a route that awarded XP
// would turn it into something worth farming.
//
// Reached by `navigator.sendBeacon` (see `useSpeakingTimeBeacon`), which cannot read a
// response, so this is written to be safe to call blindly: it takes only a duration,
// attributes it to the caller's own session server-side, and has no failure the client
// needs to hear about.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = speakingTimeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'validation_error', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await logUsage(session.user.id, 'speaking_seconds', parsed.data.seconds);

  return NextResponse.json({ recorded: parsed.data.seconds });
}
