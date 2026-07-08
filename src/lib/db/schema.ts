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
export const modeEnum = pgEnum('practice_mode', ['lesson', 'live']);
export const errorCategoryEnum = pgEnum('error_category', [
  'pronunciation',
  'grammar',
  'vocab',
]);
export const severityEnum = pgEnum('severity', ['minor', 'moderate', 'major']);
export const cefrEnum = pgEnum('cefr_level', ['A1', 'A2', 'B1', 'B2', 'C1']);

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
