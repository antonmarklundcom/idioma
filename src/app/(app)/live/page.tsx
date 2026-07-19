import { auth } from '@/lib/auth';
import { ConversationLoop } from '@/components/live/ConversationLoop';

// PLAN.md Phase 7 / §4.3: the $0 turn-based conversation loop.
export default async function LivePage() {
  const session = await auth();

  return <ConversationLoop coachingProfile={session?.user?.coachingProfile ?? null} />;
}
