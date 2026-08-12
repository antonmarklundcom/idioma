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

/** Typed answers (the §13.4 "type instead" fallback) are bounded: one utterance, not an essay. */
export const TEXT_ANSWER_MAX_CHARS = 1000;

export const lessonAttemptRequestSchema = z
  .object({
    // Exactly one input: a recording, or - for the quiet-environment fallback - text.
    audioBase64: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    text: z.string().trim().min(1).max(TEXT_ANSWER_MAX_CHARS).optional(),
    lessonId: z.uuid().optional(),
    /**
     * Index into the lesson's `content.exercises`. When present the SERVER builds
     * `promptContext` from the lesson row - required for `listen_prompt`, whose
     * `audioText` must never reach the browser (§3.4).
     */
    exerciseIndex: z.number().int().min(0).optional(),
    /** Review drill (§13.4): the server builds promptContext from the item's front/back. */
    reviewItemId: z.uuid().optional(),
    promptContext: z.string().optional(),
    mode: z.enum(['lesson', 'live', 'review']).default('lesson'),
  })
  .superRefine((body, ctx) => {
    if ((body.audioBase64 !== undefined) === (body.text !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Send exactly one of "audioBase64" or "text"',
      });
    }
    if (body.audioBase64 !== undefined && body.mimeType === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: '"mimeType" is required alongside "audioBase64"',
        path: ['mimeType'],
      });
    }
    if (body.exerciseIndex !== undefined && body.lessonId === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: '"exerciseIndex" requires "lessonId"',
        path: ['exerciseIndex'],
      });
    }
  })
  // Normalizes to the provider-neutral input shape (§14.1) so the route never has
  // to assert which of the two fields is present.
  .transform((body, ctx) => {
    const rest = {
      lessonId: body.lessonId,
      exerciseIndex: body.exerciseIndex,
      reviewItemId: body.reviewItemId,
      promptContext: body.promptContext,
      mode: body.mode,
    };
    if (typeof body.text === 'string') {
      return { ...rest, input: { kind: 'text' as const, text: body.text } };
    }
    if (typeof body.audioBase64 === 'string' && typeof body.mimeType === 'string') {
      return {
        ...rest,
        input: { kind: 'audio' as const, base64: body.audioBase64, mimeType: body.mimeType },
      };
    }
    ctx.addIssue({ code: 'custom', message: 'Send exactly one of "audioBase64" or "text"' });
    return z.NEVER;
  });

export type LessonAttemptInput = z.infer<typeof lessonAttemptRequestSchema>;

// --- /api/review (PLAN.md §2, §13.3/§13.4) ---------------------------------

export const reviewGradeRequestSchema = z.object({
  itemId: z.uuid(),
  outcome: z.enum(['again', 'good', 'easy']),
});

export type ReviewGradeInput = z.infer<typeof reviewGradeRequestSchema>;

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

// --- Curriculum content (PLAN.md §3.4, §2 /api/admin/content, Phase 5) -----

export const lessonVocabItemSchema = z.object({
  term: z.string().trim().min(1),
  gloss: z.string().trim().min(1),
  note: z.string().trim().min(1).optional(),
});

// The player MUST skip exercise `type` values it doesn't recognize (§3.4 forward
// compatibility), so only the two known types are validated strictly; any other
// non-empty `type` is accepted as-is and passed through untouched.
export const lessonExerciseSchema = z
  .object({ type: z.string().trim().min(1) })
  .passthrough()
  .superRefine((exercise, ctx) => {
    if (exercise.type === 'speak_prompt') {
      if (typeof exercise.prompt !== 'string' || exercise.prompt.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'speak_prompt exercises require a non-empty "prompt"',
          path: ['prompt'],
        });
      }
      if (
        exercise.targetHints !== undefined &&
        !(Array.isArray(exercise.targetHints) && exercise.targetHints.every((h) => typeof h === 'string'))
      ) {
        ctx.addIssue({
          code: 'custom',
          message: '"targetHints" must be an array of strings',
          path: ['targetHints'],
        });
      }
    } else if (exercise.type === 'listen_prompt') {
      if (typeof exercise.audioText !== 'string' || exercise.audioText.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'listen_prompt exercises require a non-empty "audioText"',
          path: ['audioText'],
        });
      }
      if (typeof exercise.prompt !== 'string' || exercise.prompt.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'listen_prompt exercises require a non-empty "prompt"',
          path: ['prompt'],
        });
      }
    }
  });

export const lessonContentSchema = z.object({
  intro: z.string().trim().min(1),
  vocab: z.array(lessonVocabItemSchema).default([]),
  exercises: z.array(lessonExerciseSchema).min(1),
});

export type LessonContent = z.infer<typeof lessonContentSchema>;

export const lessonImportItemSchema = z.object({
  languagePairCode: z.string().trim().min(1),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1']),
  topic: z.string().trim().min(1),
  title: z.string().trim().min(1),
  position: z.number().int().min(0).default(0),
  content: lessonContentSchema,
});

export type LessonImportItem = z.infer<typeof lessonImportItemSchema>;

export const lessonUpdateSchema = z.object({
  id: z.uuid(),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1']).optional(),
  topic: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  position: z.number().int().min(0).optional(),
  content: lessonContentSchema.optional(),
});

export type LessonUpdateInput = z.infer<typeof lessonUpdateSchema>;

export const lessonDeleteSchema = z.object({ id: z.uuid() });

