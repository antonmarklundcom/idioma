import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { languagePairs, users } from '@/lib/db/schema';
import { onboardingSchema } from '@/lib/zodSchemas';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }

  const [me] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!me) {
    return NextResponse.json({ error: 'User not found', code: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ user: me });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'validation_error', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { languagePairId, level, coachingProfile, focusSkills, timezone } = parsed.data;

  const [pair] = await db
    .select()
    .from(languagePairs)
    .where(eq(languagePairs.id, languagePairId));
  if (!pair || !pair.active) {
    return NextResponse.json(
      { error: 'Unknown or inactive language pair', code: 'invalid_language_pair' },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(users)
    .set({
      languagePairId: pair.id,
      nativeLang: pair.nativeLang,
      targetLang: pair.targetLang,
      level,
      coachingProfile,
      focusSkills,
      timezone,
    })
    .where(eq(users.id, session.user.id))
    .returning();

  return NextResponse.json({ user: updated });
}
