import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserStatsSummary } from '@/lib/gamification';
import { getUserLocale } from '@/lib/getUserLocale';
import { FREE_PRACTICE_LESSON_CONTEXT } from '@/lib/gemini/prompts';
import {
  getCompletedLessonIds,
  getLessonForPair,
  getLessonsForPair,
  getLessonVocab,
  nextLessonInPath,
  toPlayerDialogue,
  toPlayerExercises,
} from '@/lib/lessons';
import { getDueReviewItems } from '@/lib/srs';
import {
  TODAY_REVIEW_CAP,
  buildTodaySteps,
  estimateTodayMinutes,
  todaySessionShape,
} from '@/lib/today';
import { TodayFlow } from '@/components/today/TodayFlow';
import type { ReviewCard } from '@/types';

// ROADMAP.md P0.4: the post-login landing. Everything below reads the SAME data
// the individual tabs read - due review items, the path's next lesson, the free
// practice prompt - and hands it to one orchestrator. No new API routes, no new
// grading path; the four tabs remain for free navigation.
export default async function TodayPage() {
  const session = await auth();
  if (!session?.user) redirect('/');
  if (!session.user.languagePairId) redirect('/onboarding');

  const [due, lessons, completed, stats, locale] = await Promise.all([
    getDueReviewItems({
      userId: session.user.id,
      languagePairId: session.user.languagePairId,
      limit: TODAY_REVIEW_CAP,
    }),
    getLessonsForPair(session.user.languagePairId),
    getCompletedLessonIds(session.user.id),
    getUserStatsSummary(session.user.id, session.user.timezone),
    getUserLocale(session.user.id),
  ]);

  const nextUp = nextLessonInPath(lessons, completed);
  const lessonRow = nextUp ? await getLessonForPair(nextUp.id, session.user.languagePairId) : null;
  const exercises = lessonRow ? toPlayerExercises(lessonRow.content) : [];

  const cards: ReviewCard[] = due.map((item) => ({
    id: item.id,
    kind: item.kind,
    front: item.front,
    back: item.back,
  }));

  const shape = todaySessionShape(cards.length, lessonRow?.content ?? null);
  const steps = buildTodaySteps(shape);

  return (
    <div className="flex flex-1 flex-col">
      {/* There is always at least the closing speaking turn, so this never
          renders an empty session - a learner with no imported curriculum still
          gets a real minute of practice.

          The "about N minutes" line is handed to the flow rather than printed
          here: it is a promise about a session that is about to happen, and a
          page-level copy of it kept promising seven more minutes to someone
          already looking at the finish screen. */}
      <TodayFlow
        minutes={estimateTodayMinutes(shape)}
        steps={steps}
        cards={cards}
        lesson={
          lessonRow && exercises.length > 0
            ? {
                id: lessonRow.id,
                title: lessonRow.title,
                exercises,
                // The words and the conversation come with the lesson now. Both are
                // presentation - no model call, no graded turn - so the only thing
                // they cost is the minute the estimate above already accounts for,
                // and without them /today was drilling vocabulary it had never shown.
                vocab: getLessonVocab(lessonRow.content),
                dialogue: toPlayerDialogue(lessonRow.content),
              }
            : null
        }
        freePracticePrompt={FREE_PRACTICE_LESSON_CONTEXT}
        coachingProfile={session.user.coachingProfile ?? null}
        currentStreak={stats.currentStreak}
        locale={locale}
      />
    </div>
  );
}
