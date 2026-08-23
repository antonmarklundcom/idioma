import { z } from 'zod';
import { LLM_TASKS, PROVIDER_IDS } from '@/lib/llm/catalog';

export const focusSkillValues = [
  'speaking-confidence',
  'grammar',
  'listening',
  'pronunciation',
  'vocabulary',
] as const;

/**
 * One fact the tutor knows about the learner (ROADMAP.md P1.5b follow-on item 6).
 * Bounded hard: these strings are substituted into the system prompt, so an unbounded
 * one is a prompt-injection surface with a text box attached.
 */
export const PROFILE_FACT_MAX_CHARS = 200;
export const PROFILE_FACTS_MAX = 20;

export const profileFactSchema = z.object({
  id: z.string().trim().min(1).max(64),
  text: z.string().trim().min(1).max(PROFILE_FACT_MAX_CHARS),
  source: z.enum(['asked', 'learned']),
});

export type ProfileFactInput = z.infer<typeof profileFactSchema>;

export const onboardingSchema = z.object({
  languagePairId: z.uuid(),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1']),
  /**
   * The three optional questions at onboarding - what they do, where they live, and
   * one thing they care about. Sent as plain answers; the route turns them into
   * `profile_notes` facts, so the browser never decides what a stored fact looks like.
   */
  profileAnswers: z
    .object({
      job: z.string().trim().max(PROFILE_FACT_MAX_CHARS).optional(),
      city: z.string().trim().max(PROFILE_FACT_MAX_CHARS).optional(),
      caresAbout: z.string().trim().max(PROFILE_FACT_MAX_CHARS).optional(),
    })
    .optional(),
  coachingProfile: z.enum(['confidence_first', 'accuracy_focus']),
  focusSkills: z.array(z.enum(focusSkillValues)).min(1),
  timezone: z.string().min(1),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

// PATCH /api/me/preferences - standalone per-user settings, editable one at a time
// (PLAN.md §8 Phase 7B item 2 adds the first one). Every field optional; an empty body
// is a valid no-op rather than an error.
export const preferencesSchema = z.object({
  handsFreeTurnTaking: z.boolean().optional(),
  // UI language override, independent of the language pair being learned.
  uiLocale: z.enum(['en', 'es', 'sv']).optional(),
  /**
   * The CEFR level on its own - what the spoken placement check confirms. The level is
   * also part of the onboarding payload (PATCH /api/me), but a learner who has just
   * been placed has no business re-submitting their language pair to record it.
   */
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1']).optional(),
  /**
   * The whole fact list, replaced wholesale. Editing and deleting facts is what
   * Settings does with them, and a list of at most twenty short strings is cheaper to
   * send whole than to patch item by item.
   */
  profileNotes: z.array(profileFactSchema).max(PROFILE_FACTS_MAX).optional(),
  /** Whether the tutor may add facts it hears. Default OFF - see the schema comment. */
  factLearning: z.boolean().optional(),
  explanationLanguage: z.enum(['native', 'target', 'both']).optional(),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;

// --- /api/content-gap -------------------------------------------------------
/**
 * "I want practice on this": the pattern key of a recurring mistake the learner wants
 * lessons for. Bounded like every other client-supplied string - it becomes a
 * `usage_log.kind`, and an unbounded one would be a free write into that column.
 */
export const contentGapRequestSchema = z.object({
  patternKey: z.string().trim().min(1).max(120),
});

// --- /api/lesson/attempt (PLAN.md §2, §4.1) ---------------------------------

/** Typed answers (the §13.4 "type instead" fallback) are bounded: one utterance, not an essay. */
export const TEXT_ANSWER_MAX_CHARS = 1000;

/**
 * PLAN.md §6.3: on Hostinger no platform body limit backstops the client's 90s
 * recording cap, so this is the server-side bound it asked for. 90s of Opus is ~1MB
 * (~1.4M base64 chars); iOS AAC runs richer, so 4M chars (~3MB of audio) clears every
 * legitimate recording while stopping a modified client feeding megabytes into TWO
 * model calls per turn.
 */
export const AUDIO_BASE64_MAX_CHARS = 4_000_000;
/** Client-controlled text substituted into the system prompt (§2) - one screen, not a payload. */
export const PROMPT_CONTEXT_MAX_CHARS = 2000;
/**
 * The recorder cannot capture longer than its own 90s cap, so anything above this is a
 * modified client rather than a long answer. Capped rather than trusted because this
 * number is summed into "you spoke N minutes this week" - one bogus turn would make
 * that read as an afternoon.
 */
export const SPOKEN_SECONDS_MAX = 90;

export const lessonAttemptRequestSchema = z
  .object({
    // Exactly one input: a recording, or - for the quiet-environment fallback - text.
    audioBase64: z.string().min(1).max(AUDIO_BASE64_MAX_CHARS).optional(),
    mimeType: z.string().min(1).max(100).startsWith('audio/').optional(),
    text: z.string().trim().min(1).max(TEXT_ANSWER_MAX_CHARS).optional(),
    lessonId: z.uuid().optional(),
    /**
     * Index into the lesson's `content.exercises`. When present the SERVER builds
     * `promptContext` from the lesson row - required for `listen_prompt`, whose
     * `audioText` must never reach the browser (§3.4).
     */
    exerciseIndex: z.number().int().min(0).optional(),
    /**
     * Index into the lesson's `content.dialogue.lines` - the learner performing one
     * side of the exchange. Server-assembled like `exerciseIndex`, and mutually
     * exclusive with it: a turn is one or the other, never both.
     */
    dialogueLineIndex: z.number().int().min(0).optional(),
    /** Review drill (§13.4): the server builds promptContext from the item's front/back. */
    reviewItemId: z.uuid().optional(),
    promptContext: z.string().max(PROMPT_CONTEXT_MAX_CHARS).optional(),
    /**
     * How long the mic was actually capturing this turn. Spoken turns only - a typed
     * answer sends nothing, and no turn is ever refused for lacking it.
     */
    spokenSeconds: z.number().min(0).optional(),
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
    if (body.dialogueLineIndex !== undefined && body.lessonId === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: '"dialogueLineIndex" requires "lessonId"',
        path: ['dialogueLineIndex'],
      });
    }
    if (body.dialogueLineIndex !== undefined && body.exerciseIndex !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Send either "exerciseIndex" or "dialogueLineIndex", not both',
        path: ['dialogueLineIndex'],
      });
    }
  })
  // Normalizes to the provider-neutral input shape (§14.1) so the route never has
  // to assert which of the two fields is present.
  .transform((body, ctx) => {
    const rest = {
      // Clamped, not rejected: this number only feeds a "minutes spoken" statistic,
      // and refusing a whole graded turn over it would trade a real answer for a metric.
      spokenSeconds:
        body.spokenSeconds === undefined
          ? undefined
          : Math.min(Math.floor(body.spokenSeconds), SPOKEN_SECONDS_MAX),
      lessonId: body.lessonId,
      exerciseIndex: body.exerciseIndex,
      dialogueLineIndex: body.dialogueLineIndex,
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

// --- /api/session/end (PLAN.md §16 defect 1) --------------------------------
// Deliberately no session id: the server re-resolves the caller's own open session
// from these two fields, so a beacon can never close someone else's row.
// 'review' joins the list in Phase 5B: a review round opens a practice session of
// its own, so it needs the same leave-close as the other two modes.
export const sessionEndRequestSchema = z.object({
  mode: z.enum(['lesson', 'live', 'review']).default('lesson'),
  lessonId: z.uuid().optional(),
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
  /**
   * One durable fact about the learner, when they volunteered one and fact learning is
   * on (ROADMAP.md P1.5b follow-on item 6). Optional in the contract so a provider that
   * omits it, or a model that forgets it, never fails the parse and loses the turn.
   */
  learnedFact: z.string().max(PROFILE_FACT_MAX_CHARS).nullish(),
});

export type FeedbackResult = z.infer<typeof feedbackResultSchema>;

// PLAN.md §8 Phase 7B item 1: the spoken half of a turn, returned by the short
// reply-only call so TTS can start before the structured feedback exists. Deliberately
// a subset of feedbackResultSchema - the response contract to the client is unchanged,
// these two fields just arrive from a different call.
export const quickReplySchema = feedbackResultSchema.pick({
  tutorReply: true,
  followUpQuestion: true,
});

export type QuickReply = z.infer<typeof quickReplySchema>;

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
// compatibility), so only the known types are validated strictly; any other
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
    } else if (exercise.type === 'fill_gap_speak') {
      // ROADMAP.md P1.5: `sentence` carries the blank the learner has to fill by
      // speaking; `answer` is the completed sentence and is optional - it only ever
      // reaches the grader, never the browser.
      if (typeof exercise.sentence !== 'string' || exercise.sentence.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'fill_gap_speak exercises require a non-empty "sentence"',
          path: ['sentence'],
        });
      }
      if (typeof exercise.prompt !== 'string' || exercise.prompt.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'fill_gap_speak exercises require a non-empty "prompt"',
          path: ['prompt'],
        });
      }
      if (exercise.answer !== undefined && typeof exercise.answer !== 'string') {
        ctx.addIssue({
          code: 'custom',
          message: '"answer" must be a string',
          path: ['answer'],
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

/**
 * The dialogue block (ROADMAP.md lesson-loop item 4). A lesson's words and exercises
 * are isolated by design; one short exchange is what ties them into something that
 * reads like a course. Optional, so every existing lesson stays valid unchanged.
 */
export const lessonDialogueLineSchema = z.object({
  /** A short label, not a name to be spoken: "A"/"B", "Vendedora"/"Cliente". */
  speaker: z.string().trim().min(1).max(40),
  /** The line itself, in the TARGET language - this is what gets synthesized. */
  text: z.string().trim().min(1),
  /** The learner's-language meaning, shown under the line and used as their cue. */
  gloss: z.string().trim().min(1).optional(),
});

export const lessonDialogueSchema = z
  .object({
    /** One line of scene-setting in the learner's language, e.g. "En la parada". */
    setup: z.string().trim().min(1).optional(),
    /** Which speaker the LEARNER performs. Must be one of the speakers below. */
    learnerSpeaker: z.string().trim().min(1).max(40),
    lines: z.array(lessonDialogueLineSchema).min(2).max(12),
  })
  .superRefine((dialogue, ctx) => {
    if (!dialogue.lines.some((line) => line.speaker === dialogue.learnerSpeaker)) {
      ctx.addIssue({
        code: 'custom',
        message: '"learnerSpeaker" must match the speaker of at least one line',
        path: ['learnerSpeaker'],
      });
    }
  });

export const lessonContentSchema = z.object({
  intro: z.string().trim().min(1),
  /**
   * The one-line "after this you can…" promise. Optional: where a lesson doesn't
   * carry one, the reader derives a lead from the first sentence of `intro`, so no
   * existing lesson has to be rewritten to benefit (ROADMAP.md lesson-loop item 5).
   */
  canDo: z.string().trim().min(1).optional(),
  vocab: z.array(lessonVocabItemSchema).default([]),
  dialogue: lessonDialogueSchema.optional(),
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

