import { z } from 'zod';
import { LLM_TASKS, PROVIDER_IDS } from '@/lib/llm/catalog';

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

// PLAN.md §6.3: Vercel's ~4.5MB body limit used to backstop this route. On Hostinger
// no platform ceiling exists, so the server has to impose its own or the 90s
// client-side recording cap (useRecorder.ts) becomes the only bound on upload size -
// and a client-side cap bounds nothing an attacker controls. Deliberately set to the
// old platform limit: ~4.5MB of audio is ~6MB of base64, and 90s of Opus is ~1MB, so
// this stops runaways without ever touching a real recording.
export const MAX_AUDIO_BASE64_CHARS = 6_000_000;

export const lessonAttemptRequestSchema = z.object({
  audioBase64: z.string().min(1).max(MAX_AUDIO_BASE64_CHARS),
  mimeType: z.string().min(1).max(120),
  lessonId: z.uuid().optional(),
  promptContext: z.string().optional(),
  mode: z.enum(['lesson', 'live']).default('lesson'),
});

export type LessonAttemptInput = z.infer<typeof lessonAttemptRequestSchema>;

// --- /api/session/end (PLAN.md §16 defect 1) --------------------------------

export const sessionEndRequestSchema = z.object({
  sessionId: z.uuid(),
});

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

// --- Admin model settings (PLAN.md §14.4) ----------------------------------
// Model IDs are free text on purpose: providers rename and retire models faster
// than we can redeploy an enum (§10.7). Validated for shape, not membership.
export const modelSelectionSchema = z.object({
  providerId: z.enum(PROVIDER_IDS),
  modelId: z.string().trim().min(1).max(120),
});

export const llmSettingsSchema = z.object({
  tasks: z.record(z.enum(LLM_TASKS), modelSelectionSchema),
  /**
   * Speech-to-text model for providers whose chat models can't take audio
   * (OpenAI today). Ignored by providers that accept audio directly.
   */
  openaiTranscribeModelId: z.string().trim().min(1).max(120),
});

export type ModelSelection = z.infer<typeof modelSelectionSchema>;
export type LlmSettings = z.infer<typeof llmSettingsSchema>;

export const modelTestRequestSchema = modelSelectionSchema;

