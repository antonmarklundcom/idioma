import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { closeOpenSessions } from '@/lib/sessions';
import { getLessonForPair, getLessonVocab } from '@/lib/lessons';
import { countDueReviewItems, enqueueLessonVocab } from '@/lib/srs';
import { awardXp, GAMIFICATION } from '@/lib/gamification';
import { logUsage } from '@/lib/usage';

/**
 * "Lesson complete" (PLAN.md §13.2 vocab enqueue, §12.2 +25 XP).
 *
 * PLAN.md has no explicit completion event, so this is where it lives: the player
 * calls this once it has run every exercise in the lesson. The client decides WHEN
 * the lesson ended - it is the only party that knows the learner worked through the
 * last exercise - but it can't decide what that's worth: the vocab comes from the
 * lesson row, and the XP is gated on there being an open practice session for this
 * lesson, i.e. on the learner having actually recorded something.
 *
 * Completion closes that practice session (`ended_at`, which nothing else sets),
 * which makes the route idempotent for free: a second call finds no open session,
 * so it awards no XP. Coming back to redo the lesson later opens a new session and
 * completing it counts again, which is the intended behaviour - that IS more practice.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
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

  // Same close path as the leave beacon (§16 defect 1), so a lesson finished on
  // purpose and one abandoned mid-way produce the same kind of row.
  const closedCount = await closeOpenSessions({
    userId: session.user.id,
    languagePairId: session.user.languagePairId,
    mode: 'lesson',
    lessonId: lesson.id,
  });

  // Enqueued even on a repeat completion: the unique index makes it a no-op for
  // words already in the queue, and it leaves their schedules alone (§13.2).
  const enqueuedCount = await enqueueLessonVocab({
    userId: session.user.id,
    languagePairId: session.user.languagePairId,
    lessonContentId: lesson.id,
    vocab: getLessonVocab(lesson.content),
  });

  let xpAwarded = 0;
  let xpTotal: number | null = null;
  if (closedCount > 0) {
    await logUsage(session.user.id, 'lesson_complete');
    const xp = await awardXp(session.user.id, GAMIFICATION.XP_LESSON_COMPLETE);
    xpAwarded = xp.xpAwarded;
    xpTotal = xp.xpTotal;
  }

  const dueReviewCount = await countDueReviewItems(session.user.id, session.user.languagePairId);

  return NextResponse.json({
    enqueuedCount,
    alreadyCompleted: closedCount === 0,
    dueReviewCount,
    gamification: { xpAwarded, xpTotal },
  });
}
