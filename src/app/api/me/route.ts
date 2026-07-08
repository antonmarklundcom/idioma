import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { languagePairs, users } from '@/lib/db/schema';
import { updateMeSchema } from '@/lib/zodSchemas';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!user) {
    return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ user });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateMeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message, code: 'invalid_body' },
      { status: 400 },
    );
  }

  const [pair] = await db
    .select({ id: languagePairs.id, targetLang: languagePairs.targetLang, nativeLang: languagePairs.nativeLang })
    .from(languagePairs)
    .where(eq(languagePairs.id, parsed.data.languagePairId));
  if (!pair || !pair.id) {
    return NextResponse.json(
      { error: 'Unknown language pair', code: 'invalid_language_pair' },
      { status: 400 },
    );
  }

  await db
    .update(users)
    .set({
      languagePairId: pair.id,
      level: parsed.data.level,
      targetLang: pair.targetLang,
      nativeLang: pair.nativeLang,
    })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}
