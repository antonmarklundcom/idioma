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

// --- /api/lesson/attempt (PLAN.md §2, §4.1) ---------------------------------

export const lessonAttemptRequestSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
  lessonId: z.uuid().optional(),
  promptContext: z.string().optional(),
  mode: z.enum(['lesson', 'live']).default('lesson'),
});

export type LessonAttemptInput = z.infer<typeof lessonAttemptRequestSchema>;

// Mirrors the Gemini responseSchema (§4.1) - the provider-neutral contract every
// LlmProvider adapter must satisfy. Never trust model output without this passing.
export const utteranceErrorSchema = z.object({
  category: z.enum(['pronunciation', 'grammar', 'vocab']),
  severity: z.enum(['minor', 'moderate', 'major']),
  quote: z.string(),
  correction: z.string(),
  explanation: z.string(),
  patternKey: z.string(),
});

export const feedbackResultSchema = z.object({
  transcription: z.string(),
  errors: z.array(utteranceErrorSchema),
  correctedUtterance: z.string(),
  tutorReply: z.string(),
  followUpQuestion: z.string(),
});

export type FeedbackResult = z.infer<typeof feedbackResultSchema>;

