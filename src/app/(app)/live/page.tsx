import { auth } from '@/lib/auth';
import { ConversationLoop } from '@/components/live/ConversationLoop';
import { getUserLocale } from '@/lib/getUserLocale';

// PLAN.md Phase 7 / §4.3: the $0 turn-based conversation loop.
export default async function LivePage() {
  const session = await auth();
  const locale = session?.user ? await getUserLocale(session.user.id) : 'en';

  return (
    <ConversationLoop
      coachingProfile={session?.user?.coachingProfile ?? null}
      locale={locale}
      // PLAN.md §8 Phase 7B item 2: default ON here, and only here.
      handsFree={session?.user?.handsFreeTurnTaking ?? true}
    />
  );
}
