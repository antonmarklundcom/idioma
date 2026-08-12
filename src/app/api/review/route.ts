import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { reviewGradeRequestSchema } from '@/lib/zodSchemas';
import { getDueReviewItems, gradeReviewItem, SRS } from '@/lib/srs';
import { awardXp, GAMIFICATION } from '@/lib/gamification';
import { logUsage } from '@/lib/usage';

// PLAN.md §2 / §13.4. The spoken answer itself goes through /api/lesson/attempt
// (mode: 'review'); this route only serves the queue and records the resulting grade.

export async function GET() {
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

  const items = await getDueReviewItems({
    userId: session.user.id,
    languagePairId: session.user.languagePairId,
  });

  return NextResponse.json({ items, maxPerRound: SRS.MAX_ITEMS_PER_ROUND });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reviewGradeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'validation_error', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // SM-2-lite reschedule (§13.3). Returns null when the item isn't this user's,
  // which is a 404 rather than a 403 - same reasoning as /api/lessons/[lessonId].
  const schedule = await gradeReviewItem({
    userId: session.user.id,
    itemId: parsed.data.itemId,
    outcome: parsed.data.outcome,
  });
  if (!schedule) {
    return NextResponse.json({ error: 'Review item not found', code: 'not_found' }, { status: 404 });
  }

  await logUsage(session.user.id, 'review_grade');
  const xp = await awardXp(session.user.id, GAMIFICATION.XP_PER_REVIEW_GRADE);

  return NextResponse.json({
    dueAt: schedule.dueAt,
    intervalDays: schedule.intervalDays,
    reps: schedule.reps,
    lapses: schedule.lapses,
    gamification: xp,
  });
}
