import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getLlmSettings, providerKeyStatus, saveLlmSettings } from '@/lib/llm/settings';
import { llmSettingsSchema } from '@/lib/zodSchemas';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { error: 'Not signed in', code: 'unauthorized', status: 401 } as const;
  if (session.user.role !== 'admin') {
    return { error: 'Admins only', code: 'forbidden', status: 403 } as const;
  }
  return { userId: session.user.id } as const;
}

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  return NextResponse.json({
    settings: await getLlmSettings(),
    providerKeys: providerKeyStatus(),
  });
}

export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = llmSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid settings',
        code: 'validation_error',
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  await saveLlmSettings(parsed.data, guard.userId);
  return NextResponse.json({ settings: parsed.data });
}
