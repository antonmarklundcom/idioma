import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
// Matches Auth.js AdapterAccountType; typed locally so Phase 1 doesn't need
// the next-auth package installed yet (it arrives in Phase 2).
type AdapterAccountType = 'oauth' | 'oidc' | 'email' | 'webauthn';

export const roleEnum = pgEnum('role', ['learner', 'admin']);
// 'review' added in Phase 5B (PLAN.md §13): a spaced-repetition round is its own
// practice mode, so review turns are separable from lessons in the history.
export const modeEnum = pgEnum('practice_mode', ['lesson', 'live', 'review']);
export const errorCategoryEnum = pgEnum('error_category', [
  'pronunciation',
  'grammar',
  'vocab',
]);
export const severityEnum = pgEnum('severity', ['minor', 'moderate', 'major']);
export const cefrEnum = pgEnum('cefr_level', ['A1', 'A2', 'B1', 'B2', 'C1']);
// Per-user coaching style (PLAN.md §11.3) — not per language pair. Same pipeline
// for every learner; this only changes how the tutor phrases feedback.
export const coachingProfileEnum = pgEnum('coaching_profile', [
  'confidence_first',
  'accuracy_focus',
]);
// Capability tier (PLAN.md §15.3). NOT commerce: there is no billing, no checkout and
// no client-visible flag - the owner flips a row by hand with one SQL statement, and
// the server is the only thing that reads it. It exists so an expensive mode (the §4.2
// real-time upgrade, funded by the $10 credit) can be enabled for one user without
// enabling it for everyone.
export const userTierEnum = pgEnum('user_tier', ['free', 'premium']);
// Which language a correction is EXPLAINED in. Today it is fixed by the language pair
// and cannot be changed without changing the pair, which is wrong for a learner who
// wants the explanation in the language they are learning (or in both).
export const explanationLanguageEnum = pgEnum('explanation_language', [
  'native',
  'target',
  'both',
]);

export type CefrLevel = (typeof cefrEnum.enumValues)[number];
export type CoachingProfile = (typeof coachingProfileEnum.enumValues)[number];
export type PracticeMode = (typeof modeEnum.enumValues)[number];
export type UserTier = (typeof userTierEnum.enumValues)[number];
export type ExplanationLanguage = (typeof explanationLanguageEnum.enumValues)[number];

/**
 * One thing the tutor knows about the learner. `asked` facts come from the three
 * optional questions at onboarding; `learned` ones are picked up from conversation,
 * and only when the learner has turned that on.
 */
export type ProfileFact = {
  id: string;
  text: string;
  source: 'asked' | 'learned';
};

// ---------------------------------------------------------------------------
// Language-pair config: THE extensibility point. Adding Guaraní later must be
// a new row here (+ lesson content) and nothing else. Never hardcode
// pair-specific behavior in application code.
// ---------------------------------------------------------------------------
export const languagePairs = pgTable('language_pairs', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  targetLang: text('target_lang').notNull(),
  nativeLang: text('native_lang').notNull(),
  displayName: text('display_name').notNull(),
  dialectNotes: text('dialect_notes'),
  correctionStyle: text('correction_style'),
  tutorPromptTemplate: text('tutor_prompt_template').notNull(),
  conversationPromptTemplate: text('conversation_prompt_template'),
  errorTaxonomy: jsonb('error_taxonomy').$type<string[]>().notNull(),
  // Cloud TTS voice for the TARGET language. NULL = no TTS for this pair
  // (e.g. a future Guaraní pair) → UI degrades to text-only.
  ttsVoice: text('tts_voice'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Pre-generated audio for the fixed parts of a lesson (vocabulary, dialogue lines,
 * listening prompts).
 *
 * Why a table: this audio is IMMUTABLE content. Re-synthesizing "la cabaña" every time
 * someone taps it spends characters from the monthly allowance, waits on a round trip
 * to Google before the learner hears anything, and cannot work offline. The in-process
 * cache that came before this held 50 entries and died with the process - which, on a
 * platform that starts a fresh one constantly, meant it mostly missed.
 *
 * The whole library is 901 recordings across 84 lessons; generated once by
 * `npm run audio:generate`, it is then free forever.
 *
 * The tutor's own replies are NOT here and never can be: every reply is new text.
 */
export const lessonAudio = pgTable(
  'lesson_audio',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /**
     * Content-addressed: lesson, slot, index, voice, speaking rate and a hash of the
     * text itself (lib/listenAudioCache.ts builds it). Editing a lesson through /admin
     * changes the hash, so the old recording simply stops matching rather than being
     * served for the new words.
     */
    cacheKey: text('cache_key').notNull(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessonContent.id, { onDelete: 'cascade' }),
    /** base64 MP3, exactly as the audio route hands it to the browser. */
    audioBase64: text('audio_base64').notNull(),
    charCount: integer('char_count').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    // Generating twice must not store twice - the script is meant to be re-runnable.
    uniqueIndex('lesson_audio_key_idx').on(t.cacheKey),
    // Deleting a lesson's recordings when its content is replaced.
    index('lesson_audio_lesson_idx').on(t.lessonId),
  ],
);

// ---------------------------------------------------------------------------
// Auth.js (next-auth v5) adapter tables. Column shapes are dictated by
// @auth/drizzle-adapter — do not rename columns. `users` additionally carries
// app-specific profile columns (the adapter tolerates extras).
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  // --- app-specific ---
  role: roleEnum('role').notNull().default('learner'),
  nativeLang: text('native_lang'),
  targetLang: text('target_lang'),
  level: cefrEnum('level'),
  languagePairId: uuid('language_pair_id').references(() => languagePairs.id),
  // Onboarding sets these (PLAN.md §11.3, Phase 2). NULL until onboarding completes.
  coachingProfile: coachingProfileEnum('coaching_profile'),
  focusSkills: jsonb('focus_skills').$type<string[]>(),
  timezone: text('timezone'), // IANA, e.g. 'America/Asuncion', 'Europe/Stockholm'
  // PLAN.md §8 Phase 7B item 2: hands-free turn-taking (auto-stop on silence, mic
  // reopens after the tutor speaks). Per-user, default ON - it only ever applies in
  // /live. /lesson never auto-stops regardless of this flag, because a thinking pause
  // must not end a graded answer.
  handsFreeTurnTaking: boolean('hands_free_turn_taking').notNull().default(true),
  // UI language override ('en' | 'es' | 'sv'). NULL = derive from nativeLang as
  // before, so existing rows keep their current UI language untouched.
  uiLocale: text('ui_locale'),
  // PLAN.md §15.3. Defaults to 'free' so a new sign-in can never unlock a paid mode
  // by existing; the owner promotes a row by hand.
  tier: userTierEnum('tier').notNull().default('free'),
  // What the tutor knows about this learner (ROADMAP.md P1.5b follow-on item 6). NULL
  // until the first fact is stored. Fed into the system prompt the same way
  // focus_skills is - so no language pair's template has to change.
  profileNotes: jsonb('profile_notes').$type<ProfileFact[]>(),
  // Whether the tutor may add to that list from what it hears. Default OFF by owner
  // decision: a tutor quietly building a profile is something you opt into. The three
  // facts ASKED for at onboarding are stored regardless - the learner typed them.
  factLearning: boolean('fact_learning').notNull().default(false),
  explanationLanguage: explanationLanguageEnum('explanation_language')
    .notNull()
    .default('native'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// Auth login sessions (Auth.js). NOT the product's practice sessions — those
// live in `practice_sessions` below. Do not conflate the two.
export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Practice data
// ---------------------------------------------------------------------------
export const practiceSessions = pgTable(
  'practice_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languagePairId: uuid('language_pair_id')
      .notNull()
      .references(() => languagePairs.id),
    mode: modeEnum('mode').notNull(),
    lessonId: uuid('lesson_id').references(() => lessonContent.id),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    endedAt: timestamp('ended_at'),
  },
  (t) => [index('ps_user_idx').on(t.userId, t.startedAt)],
);

export type UtteranceError = {
  category: 'pronunciation' | 'grammar' | 'vocab';
  severity: 'minor' | 'moderate' | 'major';
  quote: string;
  correction: string;
  explanation: string;
  patternKey: string;
};

export const utterances = pgTable(
  'utterances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => practiceSessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    speaker: text('speaker').notNull().default('user'),
    // Always NULL in the beta (decided: audio is not stored).
    audioRef: text('audio_ref'),
    transcript: text('transcript'),
    corrected: text('corrected'),
    tutorReply: text('tutor_reply'),
    followUpQuestion: text('follow_up_question'),
    errors: jsonb('errors').$type<UtteranceError[]>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('utt_session_idx').on(t.sessionId)],
);

// Aggregated recurring mistakes — powers the dashboard. One row per
// (user, pair, patternKey); occurrences increment via upsert.
export const errorPatterns = pgTable(
  'error_patterns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languagePairId: uuid('language_pair_id')
      .notNull()
      .references(() => languagePairs.id),
    category: errorCategoryEnum('category').notNull(),
    patternKey: text('pattern_key').notNull(),
    description: text('description').notNull(),
    exampleQuote: text('example_quote'),
    occurrenceCount: integer('occurrence_count').notNull().default(1),
    firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ep_unique').on(t.userId, t.languagePairId, t.patternKey)],
);

// Owner-supplied curriculum. Imported via /admin, never generated by the app.
export const lessonContent = pgTable(
  'lesson_content',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    languagePairId: uuid('language_pair_id')
      .notNull()
      .references(() => languagePairs.id),
    level: cefrEnum('level').notNull(),
    topic: text('topic').notNull(),
    title: text('title').notNull(),
    position: integer('position').notNull().default(0),
    content: jsonb('content').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('lc_pair_level_idx').on(t.languagePairId, t.level, t.topic)],
);

// Quota early-warning: every metered action logs here; the admin page sums
// today's usage against the free-tier caps (PLAN.md §6.5).
export const usageLog = pgTable(
  'usage_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    amount: integer('amount').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('ul_user_day_idx').on(t.userId, t.createdAt)],
);

// Admin-editable runtime configuration (PLAN.md §14.4). One row per setting key,
// value is the setting's own JSON shape - Zod-validated on write AND on read, since
// a bad row here would otherwise reach the provider layer. Currently only
// 'llm_models' (the per-task provider/model selection) lives here.
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
});

// Gamification (PLAN.md §12, Phase 4B): one row per user. XP history isn't stored
// separately - usage_log already has every metered action with timestamps, which is
// enough for the Phase 8 weekly recap.
export const userStats = pgTable('user_stats', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  xpTotal: integer('xp_total').notNull().default(0),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  // 'YYYY-MM-DD' in the USER's timezone (§12.2) - never server UTC, or Asunción and
  // Stockholm's streaks would corrupt each other across the day boundary.
  lastGoalMetDate: text('last_goal_met_date'),
  // ISO week 'YYYY-Www' the auto-shield was last consumed in, or NULL. One shield/week.
  streakShieldUsedInWeek: text('streak_shield_used_in_week'),
  dailyGoalTarget: integer('daily_goal_target').notNull().default(3),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Spaced repetition (PLAN.md §13, Phase 5B). Two sources feed this queue: lesson
// vocab (on lesson completion) and the learner's own recurring mistakes (on every
// error_patterns upsert) - see lib/srs.ts. `kind` is text rather than a pg enum
// because the source list is expected to grow and an enum would need a migration
// per addition; `sourceRef` points back into the source table (see below).
export const reviewItemKinds = ['vocab', 'error_pattern'] as const;
export type ReviewItemKind = (typeof reviewItemKinds)[number];

export const reviewItems = pgTable(
  'review_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languagePairId: uuid('language_pair_id')
      .notNull()
      .references(() => languagePairs.id),
    kind: text('kind').$type<ReviewItemKind>().notNull(),
    // vocab: '<lessonContentId>#<vocabIndex>'; error_pattern: errorPatterns.id
    sourceRef: text('source_ref').notNull(),
    front: text('front').notNull(), // prompt shown to the learner (native language)
    back: text('back').notNull(), // expected production (target language)
    // ×100 so the ease factor is an integer column: 250 = 2.50 (PLAN.md §3.3/§13.3).
    easeFactor: integer('ease_factor_x100').notNull().default(250),
    intervalDays: integer('interval_days').notNull().default(0),
    dueAt: timestamp('due_at').notNull().defaultNow(),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    // Makes enqueueing idempotent: re-completing a lesson or hitting the same
    // mistake again must never duplicate an item (PLAN.md §13.2).
    uniqueIndex('ri_unique').on(t.userId, t.kind, t.sourceRef),
    index('ri_due_idx').on(t.userId, t.dueAt),
  ],
);
