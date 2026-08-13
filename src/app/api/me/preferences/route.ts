import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { preferencesSchema } from '@/lib/zodSchemas';

// Separate from PATCH /api/me on purpose: that route owns the onboarding shape (language
// pair + level + coaching profile, all required together). This one edits standalone
// preferences one at a time, so /settings can toggle a switch without re-submitting an
// onboarding payload.
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'validation_error', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(users)
    .set(parsed.data)
    .where(eq(users.id, session.user.id))
    .returning({ handsFreeTurnTaking: users.handsFreeTurnTaking });

  return NextResponse.json({ preferences: updated });
}
