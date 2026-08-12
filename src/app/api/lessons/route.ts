import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getLessonsForPair } from '@/lib/lessons';
import type { CefrLevel } from '@/lib/db/schema';

const CEFR_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

function isCefrLevel(value: string | null): value is CefrLevel {
  return value !== null && (CEFR_LEVELS as readonly string[]).includes(value);
}

// PLAN.md §2: list lesson_content for the signed-in user's language pair,
// filtered by ?level=&topic=.
export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const levelParam = searchParams.get('level');
  const topicParam = searchParams.get('topic');
  if (levelParam !== null && !isCefrLevel(levelParam)) {
    return NextResponse.json(
      { error: `Invalid level "${levelParam}"`, code: 'validation_error' },
      { status: 400 },
    );
  }

  const lessons = await getLessonsForPair(session.user.languagePairId, {
    level: levelParam ?? undefined,
    topic: topicParam ?? undefined,
  });

  return NextResponse.json({ lessons });
}
