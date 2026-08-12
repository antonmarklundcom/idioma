import { auth } from '@/lib/auth';
import { LessonPlayer } from '@/components/lesson/LessonPlayer';
import { FREE_PRACTICE_LESSON_CONTEXT } from '@/lib/gemini/prompts';

// Free conversation practice, no fixed curriculum. Moved here from /lesson in
// Phase 5, which turned /lesson into the curriculum browser (PLAN.md §8).
export default async function LessonPracticePage() {
  const session = await auth();

  return (
    <LessonPlayer
      coachingProfile={session?.user?.coachingProfile ?? null}
      initialPrompt={FREE_PRACTICE_LESSON_CONTEXT}
    />
  );
}
