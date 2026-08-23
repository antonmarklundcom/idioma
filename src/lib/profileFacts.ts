import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, type ProfileFact } from '@/lib/db/schema';
import { PROFILE_FACTS_MAX, PROFILE_FACT_MAX_CHARS } from '@/lib/zodSchemas';

/**
 * The facts the tutor knows about a learner (ROADMAP.md P1.5b follow-on item 6).
 *
 * Two ways in: the three optional questions at onboarding, and - only when the learner
 * has switched it on - what the tutor picks up in conversation. Both end up as the same
 * short strings, and both are shown, editable and deletable in Settings: nothing the
 * tutor knows about someone is hidden from them.
 */

/** Stable enough to key React lists and to delete by, without pulling in a uuid dep. */
function factId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
}

/** The three onboarding answers, as facts. Blank answers are simply not facts. */
export function factsFromOnboardingAnswers(answers: {
  job?: string;
  city?: string;
  caresAbout?: string;
}): ProfileFact[] {
  const lines = [
    answers.job?.trim() ? `Work: ${answers.job.trim()}` : null,
    answers.city?.trim() ? `Lives in: ${answers.city.trim()}` : null,
    answers.caresAbout?.trim() ? `Cares about: ${answers.caresAbout.trim()}` : null,
  ];
  return lines
    .filter((line): line is string => line !== null)
    .map((text) => ({ id: factId(), text: text.slice(0, PROFILE_FACT_MAX_CHARS), source: 'asked' }));
}

/**
 * Adds one learned fact, or returns null when there is nothing to add - a blank, or
 * something the tutor already knows. Returning null rather than an unchanged array is
 * what lets the caller skip the write entirely.
 *
 * At the cap, the oldest LEARNED fact makes way. Facts the learner typed at onboarding
 * are never evicted by something the model overheard.
 */
export function addLearnedFact(
  existing: ProfileFact[] | null,
  text: string,
): ProfileFact[] | null {
  const clean = text.trim().slice(0, PROFILE_FACT_MAX_CHARS);
  if (clean.length === 0) return null;

  const facts = existing ?? [];
  if (facts.some((f) => normalize(f.text) === normalize(clean))) return null;

  const next = [...facts, { id: factId(), text: clean, source: 'learned' as const }];
  if (next.length <= PROFILE_FACTS_MAX) return next;

  const oldestLearned = next.findIndex((f) => f.source === 'learned');
  if (oldestLearned === -1) return next.slice(next.length - PROFILE_FACTS_MAX);
  return next.filter((_, i) => i !== oldestLearned);
}

/**
 * Stores one fact the tutor heard. Reads the row rather than trusting the session's
 * copy: the session was minted before this turn, and two turns finishing close
 * together would otherwise write over each other's fact.
 */
export async function saveLearnedFact(userId: string, text: string): Promise<void> {
  const [row] = await db
    .select({ profileNotes: users.profileNotes, factLearning: users.factLearning })
    .from(users)
    .where(eq(users.id, userId));
  // Re-checked here, not just at the call site: the learner may have turned this off
  // while the turn was in flight, and a fact stored after that is a broken promise.
  if (!row || !row.factLearning) return;

  const next = addLearnedFact(row.profileNotes, text);
  if (!next) return;
  await db.update(users).set({ profileNotes: next }).where(eq(users.id, userId));
}
