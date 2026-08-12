import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getProvider } from '@/lib/llm/provider';
import { feedbackResultSchema, modelTestRequestSchema } from '@/lib/zodSchemas';
import { logUsage } from '@/lib/usage';

// Real API calls take time; keep well inside Vercel Hobby's ceiling (PLAN.md §6.1).
export const maxDuration = 60;

// A text-only probe: does this key work, does this model exist, does it return
// feedback JSON our Zod contract accepts? Text rather than audio on purpose - it is
// cheap, fast, and provider-independent. It does NOT prove audio input works, which
// is why the UI says so.
const TEST_SYSTEM_PROMPT =
  'You are a language tutor giving structured feedback on a learner utterance. ' +
  'Reply strictly in the required JSON shape. Use "grammar" or "vocab" for the error ' +
  'category and a short kebab-case string for patternKey.';
const TEST_UTTERANCE = 'Yesterday I go to the store and buyed two bread.';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only', code: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = modelTestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', code: 'validation_error' },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const raw = await getProvider(parsed.data.providerId).getFeedback({
      systemPrompt: TEST_SYSTEM_PROMPT,
      userTurnContext: 'Test call from the admin page - no learner involved.',
      input: { kind: 'text', text: TEST_UTTERANCE },
      model: parsed.data.modelId,
    });
    const latencyMs = Date.now() - startedAt;
    const validated = feedbackResultSchema.safeParse(raw);

    await logUsage(session.user.id, 'admin_model_test');

    return NextResponse.json({
      ok: true,
      latencyMs,
      schemaValid: validated.success,
      // Shown so the admin can eyeball the tone the model produces, not just that
      // it answered. Rendered as text by React - never as HTML (PLAN.md §10.6).
      sampleReply: validated.success ? validated.data.tutorReply : null,
      errorCount: validated.success ? validated.data.errors.length : null,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
