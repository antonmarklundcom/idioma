import { z } from 'zod';

export const focusSkillValues = [
  'speaking-confidence',
  'grammar',
  'listening',
  'pronunciation',
  'vocabulary',
] as const;

export const onboardingSchema = z.object({
  languagePairId: z.uuid(),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1']),
  coachingProfile: z.enum(['confidence_first', 'accuracy_focus']),
  focusSkills: z.array(z.enum(focusSkillValues)).min(1),
  timezone: z.string().min(1),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
