import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getLessonForPair } from '@/lib/lessons';

// PLAN.md §2: one lesson's full content JSON, scoped to the caller's own
// language pair - a lessonId from a different pair is a 404, not a 403, to
// avoid confirming that the id exists at all.
export async function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }
  if (!session.user.languagePairId) {
    return NextResponse.json(
      { error: 'Complete onboarding first', code: 'onboarding_incomplete' },
      { status: 400 },
    );
  }

  const { lessonId } = await params;
  const lesson = await getLessonForPair(lessonId, session.user.languagePairId);
  if (!lesson) {
    return NextResponse.json({ error: 'Lesson not found', code: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ lesson });
}
