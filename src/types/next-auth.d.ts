import type { CefrLevel, CoachingProfile, UserTier } from '@/lib/db/schema';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'learner' | 'admin';
      tier: UserTier;
      languagePairId: string | null;
      level: CefrLevel | null;
      coachingProfile: CoachingProfile | null;
      focusSkills: string[] | null;
      timezone: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role: 'learner' | 'admin';
    tier: UserTier;
    languagePairId: string | null;
    level: CefrLevel | null;
    coachingProfile: CoachingProfile | null;
    focusSkills: string[] | null;
    timezone: string | null;
  }
}
