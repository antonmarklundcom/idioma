import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { normalizeLocale, type Locale } from '@/lib/i18n';

// Kept separate from i18n.ts so pages can import { t, Locale, normalizeLocale }
// without pulling the db client into the bundle. Reads users.nativeLang directly
// (PLAN.md §8 Phase 8) rather than the Auth.js session, which doesn't carry it.
export async function getUserLocale(userId: string): Promise<Locale> {
  const [row] = await db
    .select({ nativeLang: users.nativeLang, uiLocale: users.uiLocale })
    .from(users)
    .where(eq(users.id, userId));
  // An explicit UI-language choice (settings flag switcher) wins; otherwise the
  // pre-existing behavior: derive from the language pair's native side.
  return normalizeLocale(row?.uiLocale ?? row?.nativeLang);
}
