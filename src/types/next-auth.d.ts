import type {
  CefrLevel,
  CoachingProfile,
  ExplanationLanguage,
  ProfileFact,
  UserTier,
} from '@/lib/db/schema';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'learner' | 'admin';
      languagePairId: string | null;
      level: CefrLevel | null;
      coachingProfile: CoachingProfile | null;
      focusSkills: string[] | null;
      timezone: string | null;
      handsFreeTurnTaking: boolean;
      tier: UserTier;
      profileNotes: ProfileFact[] | null;
      factLearning: boolean;
      explanationLanguage: ExplanationLanguage;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role: 'learner' | 'admin';
    languagePairId: string | null;
    level: CefrLevel | null;
    coachingProfile: CoachingProfile | null;
    focusSkills: string[] | null;
    timezone: string | null;
    handsFreeTurnTaking: boolean;
    tier: UserTier;
    profileNotes: ProfileFact[] | null;
    factLearning: boolean;
    explanationLanguage: ExplanationLanguage;
  }
}
