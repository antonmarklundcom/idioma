import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { contentGapRequestSchema } from '@/lib/zodSchemas';
import { logContentGap } from '@/lib/usage';

/**
 * "I want practice on this" (ROADMAP.md P1.5b follow-on item 5). The learner-triggered
 * half of content-gap collection: the automatic detection notices a recurring mistake
 * with nothing to drill, and this notices a learner ASKING for one.
 *
 * Both land in the same place - `usage_log` as `content_gap:<patternKey>` - so /admin
 * shows one ranked list rather than two that have to be read together.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = contentGapRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'validation_error', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await logContentGap(session.user.id, parsed.data.patternKey);
  return NextResponse.json({ ok: true });
}
