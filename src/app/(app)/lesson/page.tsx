import { auth } from '@/lib/auth';
import { LessonPlayer } from '@/components/lesson/LessonPlayer';
import { FREE_PRACTICE_LESSON_CONTEXT } from '@/lib/gemini/prompts';

// Phase 3 (PLAN.md): free-practice only, no curriculum yet. Lesson browsing by
// level/topic arrives in Phase 5 once real lesson content is imported.
export default async function LessonPage() {
  const session = await auth();

  return (
    <LessonPlayer
      coachingProfile={session?.user?.coachingProfile ?? null}
      initialPrompt={FREE_PRACTICE_LESSON_CONTEXT}
    />
  );
}
