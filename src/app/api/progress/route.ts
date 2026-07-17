import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDashboardData } from '@/lib/progress';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthorized' }, { status: 401 });
  }
  if (!session.user.languagePairId) {
    return NextResponse.json(
      { error: 'Complete onboarding first', code: 'onboarding_incomplete' },
      { status: 400 },
    );
  }

  const data = await getDashboardData(session.user.id, session.user.languagePairId);
  return NextResponse.json(data);
}
