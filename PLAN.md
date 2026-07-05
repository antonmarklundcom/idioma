# PLAN.md — "Idioma" Language-Learning Web App

**Status: DRAFT — awaiting owner approval. Do not begin coding until the owner replies
"approved, proceed to Phase 1".**

This document is a self-contained build spec. It is written so that a Claude model (Opus 4.8 /
Sonnet 5) in a fresh session, with no memory of the planning conversation, can execute any phase
from this document alone. Read the whole document before starting any phase.

---

## 0. Project summary and hard constraints

A language-learning PWA for exactly two beta users:

- The owner: English speaker learning **Paraguayan-flavored Spanish** (voseo, local vocabulary).
- His partner: Paraguayan Spanish speaker learning **English**.

A **Guaraní** section is planned later but OUT OF SCOPE. The architecture must allow adding it as
**one new row in the `language_pairs` table + new lesson content only** — zero code changes.

Two practice modes sharing one backend:

1. **Lesson mode** (build first): user records a spoken utterance in the browser; a serverless
   API route sends the audio inline to Gemini `generateContent` with a structured-output schema;
   the response (transcription, errors, correction, tutor reply, follow-up question) is shown to
   the user and persisted. The tutor's reply + follow-up question are **also spoken aloud** via
   Google Cloud Text-to-Speech Neural2 (§4.5), so lesson mode is a real spoken back-and-forth,
   not text-only.
2. **Live conversation mode** (build second): real-time voice-to-voice via the Gemini Live API,
   browser connecting directly to Google over WebSocket (client-to-server pattern) using a
   short-lived ephemeral token minted by a serverless route. **See §4.3 — this has a billing
   catch that needs an owner decision.**

### Hard constraints (violating any of these is a spec failure)

| Constraint | Detail |
|---|---|
| Hosting | Vercel **Hobby (free)** tier only. No Hostinger slot. No always-on server, no persistent WebSocket process on our infra. |
| Cost | $0/month expected for the beta. One Google Cloud project carries a billing account (required for Cloud TTS even within its free allotment, §4.5) but stays at $0 spend via free monthly quotas + budget alerts. The only possible real charge is Live mode (§4.3, owner decides). |
| Stack | Next.js (App Router) + TypeScript + Tailwind. Drizzle ORM. Auth.js with Google OAuth. |
| Database | **Neon** free tier (decision + tradeoff in §3.1). |
| Curriculum | ALL lesson content is supplied by the owner. **Never generate curriculum content.** Build only the delivery mechanism and an import path. |
| PWA | Manifest + service worker from day one; installable on Android/iOS/desktop; later wrappable as an Android TWA (§7). |
| Extensibility | Language-pair behavior (dialect notes, correction style, tutor prompts) lives in DB config, never hardcoded. |

### Verified external facts (verified July 2026 — re-verify at build time, see §9 Q7)

These were confirmed against Google's docs/community sources in July 2026. Model names and
quotas change often; the builder should sanity-check them at https://ai.google.dev/gemini-api/docs
before Phase 3 and Phase 7, and update this file if they've drifted.

- **Lesson-mode model:** `gemini-3.5-flash` (GA; also behind the `gemini-flash-latest` alias).
  Multimodal, accepts inline audio, supports structured output. Free tier: **15 RPM,
  1,500 requests/day (resets 00:00 US-Pacific), 1M tokens/min**.
- **Live-mode model:** `gemini-3.1-flash-live-preview` (native audio, low latency). Free tier:
  max **3 concurrent sessions**; ~**10-minute** connection duration before session resumption is
  required (audio-only session cap ~15 min without context compression). Input must be **raw
  16-bit PCM, 16 kHz, mono, little-endian** (`audio/pcm;rate=16000`); output audio is 24 kHz PCM.
- **Inline audio MIME types accepted by `generateContent`:** includes `audio/webm` (Opus-in-WebM,
  i.e. Chrome/Android MediaRecorder output), plus `audio/mp3`, `audio/wav`, `audio/ogg`,
  `audio/opus`, `audio/aac`, `audio/m4a`. **No client-side conversion needed for lesson mode.**
  Max ~20 MB total inline request size.
- **Structured output (JS SDK `@google/genai`):** `config.responseMimeType: 'application/json'` +
  `config.responseSchema` (using the SDK's `Type` enum). `responseJsonSchema` is deprecated.
- **Live transcription:** enable `inputAudioTranscription: {}` and `outputAudioTranscription: {}`
  in the Live session config to receive text transcripts of both sides. Works in Spanish and
  English on the live model.
- **Ephemeral tokens:** created server-side via `ai.authTokens.create(...)` against the
  **`v1alpha`** API version; `liveConnectConstraints` locks model + systemInstruction server-side
  so the browser can't override them. ⚠️ **Reported to require a billing-enabled (Tier 1)
  project — NOT available on the free tier.** See §4.3.
- ⚠️ **Free-tier billing trap:** once a Google Cloud billing account is linked to the project
  that owns the Gemini API key, the free-tier allowance for that project is gone (you pay from
  the first token). Therefore: **the lesson-mode API key must live in a project that never gets
  billing linked.** This drives the two-project setup in Phase 0.
- **Google Cloud Text-to-Speech (tutor voice, §4.5):** Neural2 voices have a **1M
  characters/month free allotment** (Standard: 4M/month); usage beyond that is charged
  ($16/1M chars Neural2). **The TTS API cannot be enabled without a billing account on the
  project** — even to use only the free allotment. Hence project B (billed) exists from Phase 0
  regardless of the Live-mode decision, with budget alerts so expected spend is $0. Latin
  American Spanish is served by `es-US` Neural2 voices; English by `en-US` Neural2. REST
  endpoint `https://texttospeech.googleapis.com/v1/text:synthesize` (API-key auth works),
  returns base64 audio; request MP3 encoding. Exact voice variant names: builder lists current
  voices at build time and records the chosen ones in `language_pairs.tts_voice`.
- **iOS Safari gotcha:** MediaRecorder on iOS produces `audio/mp4` (AAC), not `audio/webm`. Both
  are accepted by Gemini, so the client must send its *actual* recorded MIME type dynamically —
  never hardcode `audio/webm`.

---

## 1. File / folder structure

```
idioma/
├── PLAN.md                          # this file
├── package.json
├── next.config.ts                   # incl. Serwist plugin for the service worker
├── tsconfig.json
├── tailwind.config.ts               # (or CSS-based Tailwind v4 config)
├── drizzle.config.ts                # drizzle-kit config → Neon
├── .env.example                     # documented env vars, no secrets
├── .env.local                       # gitignored; real secrets
│
├── drizzle/                         # generated SQL migrations (committed)
│
├── public/
│   ├── manifest.webmanifest
│   ├── icons/
│   │   ├── icon-192.png             # maskable
│   │   ├── icon-512.png             # maskable
│   │   └── apple-touch-icon.png     # 180×180, iOS
│   └── .well-known/
│       └── assetlinks.json          # added only in the TWA phase (§7.3)
│
├── src/
│   ├── middleware.ts                # auth guard for /app/** and /admin/**
│   │
│   ├── app/
│   │   ├── layout.tsx               # root layout: fonts, manifest link, theme-color
│   │   ├── page.tsx                 # public landing page + sign-in entry
│   │   ├── globals.css
│   │   ├── sw.ts                    # Serwist service worker source
│   │   │
│   │   ├── (app)/                   # authenticated learner area (route group)
│   │   │   ├── layout.tsx           # app shell: nav, session provider
│   │   │   ├── onboarding/page.tsx  # pick language pair + level (first login)
│   │   │   ├── dashboard/page.tsx   # progress + recurring-mistakes dashboard
│   │   │   ├── lesson/page.tsx      # lesson list (by level/topic)
│   │   │   ├── lesson/[lessonId]/page.tsx   # lesson player: record → feedback loop
│   │   │   ├── live/page.tsx        # live conversation mode (Phase 7)
│   │   │   └── settings/page.tsx    # profile: langs, level, sign out
│   │   │
│   │   ├── admin/                   # role === 'admin' only (middleware-guarded)
│   │   │   ├── page.tsx             # usage stats (quota early-warning, §6.5)
│   │   │   └── content/page.tsx     # lesson-content import/manage UI
│   │   │
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── me/route.ts
│   │       ├── lesson/attempt/route.ts       # THE core route (audio → Gemini → persist)
│   │       ├── lessons/route.ts
│   │       ├── lessons/[lessonId]/route.ts
│   │       ├── progress/route.ts
│   │       ├── live/token/route.ts           # ephemeral-token mint (Phase 7)
│   │       ├── live/session/route.ts         # save live transcript + post-analysis
│   │       └── admin/content/route.ts
│   │
│   ├── components/
│   │   ├── ui/                      # buttons, cards, badges (small, hand-rolled)
│   │   ├── recorder/
│   │   │   ├── UtteranceRecorder.tsx    # MediaRecorder wrapper (lesson mode)
│   │   │   └── useRecorder.ts           # hook: permission, record, blob + real mimeType
│   │   ├── lesson/
│   │   │   ├── FeedbackCard.tsx         # errors color-coded by severity/category
│   │   │   └── LessonPlayer.tsx         # prompt → record → feedback → follow-up loop
│   │   ├── live/
│   │   │   ├── LiveSession.tsx          # WebSocket lifecycle + timer UI (Phase 7)
│   │   │   ├── useLiveAudio.ts          # mic capture → 16kHz PCM16; 24kHz playback
│   │   │   └── pcm-worklet.ts           # AudioWorklet processor (downsample/encode)
│   │   └── dashboard/
│   │       ├── ErrorPatternList.tsx
│   │       └── SessionHistory.tsx
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts             # Neon HTTP driver + drizzle instance
│   │   │   └── schema.ts            # ALL tables (§3.3)
│   │   ├── auth.ts                  # Auth.js config (§5)
│   │   ├── gemini/
│   │   │   ├── client.ts            # @google/genai instances (lesson key / live key)
│   │   │   ├── lessonFeedback.ts    # generateContent call + responseSchema (§4.1)
│   │   │   ├── liveToken.ts         # authTokens.create wrapper (§4.2)
│   │   │   ├── transcriptAnalysis.ts# post-live text-only error extraction (§4.4)
│   │   │   └── prompts.ts           # system-prompt ASSEMBLY from language_pairs rows.
│   │   │                            #   Templating only — all pair-specific wording
│   │   │                            #   comes from the DB, never hardcoded here.
│   │   ├── tts.ts                   # Google Cloud TTS Neural2 wrapper (§4.5)
│   │   ├── errorPatterns.ts         # upsert/aggregate logic for error_patterns
│   │   ├── usage.ts                 # per-user daily caps + usage_log writes (§6.5)
│   │   └── zodSchemas.ts            # request/response validation
│   │
│   └── types/index.ts               # shared TS types (GeminiFeedback, etc.)
└── ...
```

Conventions for builders:
- Server-only secrets (`GEMINI_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, OAuth secrets) are read
  only in `lib/` and `app/api/` — never in client components. `NEXT_PUBLIC_` prefix only for
  genuinely public values.
- All API route handlers: check auth session first, validate body with Zod, return typed JSON
  errors `{ error: string, code: string }`.

---

## 2. API routes

All routes are Next.js App Router route handlers (serverless functions on Vercel).

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | — | Auth.js handlers (Google OAuth sign-in/callback/session). |
| `/api/me` | GET | learner | Current user profile incl. `native_lang`, `target_lang`, `level`, `role`, active language pair. |
| `/api/me` | PATCH | learner | Update profile (onboarding sets langs + level; settings edits them). Validates `target_lang` against active `language_pairs`. |
| `/api/lesson/attempt` | POST | learner | **Core route.** Body: `{ audioBase64, mimeType, lessonId?, promptContext? }`. Flow: ① enforce per-user daily cap (§6.5) ② load user + language pair + top recurring `error_patterns` ③ assemble system prompt (§4.1) ④ call Gemini `generateContent` with inline audio + `responseSchema` ⑤ synthesize `tutorReply + " " + followUpQuestion` to MP3 via Cloud TTS (§4.5; non-fatal on failure — return feedback without audio) ⑥ persist utterance + errors, upsert `error_patterns`, log usage (incl. `tts_chars`) ⑦ return the structured feedback JSON + `tutorAudioBase64` (nullable). TTS is server-side only — the client never sends free text to be synthesized, so the TTS quota can't be abused as a generic synthesizer. `export const maxDuration = 60` (Gemini audio calls can take 5–20 s; Vercel Hobby default is 10 s but allows up to 60). |
| `/api/lessons` | GET | learner | List lesson_content for the user's language pair, filtered by `level`/`topic` query params. |
| `/api/lessons/[lessonId]` | GET | learner | One lesson's full content JSON. |
| `/api/progress` | GET | learner | Dashboard payload: `error_patterns` ranked by `occurrence_count` and recency, per-category counts over time, recent practice sessions with utterance counts. |
| `/api/live/token` | POST | learner | **Ephemeral-token mint** (Phase 7). Body: `{ }` (config derived server-side). Flow: ① enforce daily live-minutes cap ② load language pair config ③ `ai.authTokens.create` (`v1alpha`) with `uses: 1`, `newSessionExpireTime` ≈ now+2 min, `expireTime` ≈ now+30 min, and `liveConnectConstraints` locking `model: 'gemini-3.1-flash-live-preview'`, the assembled `systemInstruction`, `responseModalities: ['AUDIO']`, and input/output transcription on ④ create a `practice_sessions` row (mode `live`), return `{ token, sessionId, maxSeconds }`. The browser then connects **directly to Google** — no WebSocket touches our infra. ⚠️ Gated on the §4.3 billing decision. |
| `/api/live/session` | POST | learner | End-of-live-session save. Body: `{ sessionId, turns: [{ speaker: 'user'\|'tutor', text }] }` (accumulated client-side from Live transcription events). Persists turns as `utterances`, marks the session ended, then runs **text-only** error extraction on the user's turns via `gemini-3.5-flash` (§4.4) and upserts `error_patterns`. |
| `/api/admin/content` | GET/POST/PUT/DELETE | admin | Import/manage `lesson_content`. POST accepts a JSON array of lessons (§3.4 shape) for bulk import — the owner pastes/uploads his own material here. Zod-validates every item. |

Notes:
- Audio is sent as base64 JSON rather than multipart to keep the route dead simple; Vercel's
  ~4.5 MB body limit then caps recordings at roughly ~3 MB of audio ≈ 2–3 minutes of Opus — far
  more than a single utterance needs. Enforce a 90-second client-side recording cap anyway.
- No `/api/live` WebSocket route exists by design: serverless can't hold sockets. The Live
  connection is browser↔Google only.

---

## 3. Database: Neon (Postgres) + Drizzle

### 3.1 Why Neon over Turso

**Recommendation: Neon.** Reasons, in order of weight:

1. **The `error_patterns` dashboard is the product's long-term value**, and it's an aggregation
   workload (group-by, jsonb filtering, upserts with `ON CONFLICT`). Postgres `jsonb` +
   real SQL aggregates fit this natively; SQLite/libSQL stores JSON as text with a thinner
   function set and no native upsert-increment ergonomics for this shape.
2. **Auth.js Drizzle adapter is first-class on Postgres** — the documented, most-trodden path.
3. **Neon's HTTP driver (`@neondatabase/serverless`)** is designed for exactly this deployment:
   stateless serverless functions on Vercel, no connection-pool management.
4. Enum types, `uuid`, `timestamptz` keep the schema self-documenting.

**The tradeoff (why Turso was tempting):** Neon's free tier **autosuspends compute after ~5
minutes idle**, so the first request after a quiet period pays a ~0.5–1 s DB cold start on top of
the Vercel function cold start. Turso has no comparable cold start and a very generous free tier.
For a 2-user beta this occasional extra second on the *first* page load is acceptable; the richer
query surface for the mistakes dashboard is worth more. (Detection: see §6.2.)

Free-tier envelope (Neon): ~0.5 GB storage, limited monthly compute hours (autosuspend keeps
usage tiny at this scale). We store **no audio blobs** (§9 Q3), so text rows won't approach
0.5 GB for years.

### 3.2 Tables — overview and relations

**Naming note:** Auth.js's database adapter needs tables named `users`, `accounts`, `sessions`,
`verification_tokens`. The product's "sessions" concept is therefore named **`practice_sessions`**
to avoid colliding with auth sessions. Do not rename either.

```
users 1──N accounts               (Auth.js: linked OAuth accounts)
users 1──N sessions               (Auth.js: login sessions)
users 1──N practice_sessions ──N utterances
users 1──N error_patterns
users N──1 language_pairs         (via users.language_pair_id, nullable until onboarding)
language_pairs 1──N lesson_content
language_pairs 1──N practice_sessions
users 1──N usage_log              (quota early-warning, §6.5)
```

### 3.3 Drizzle schema sketch (`src/lib/db/schema.ts`)

This is a sketch, not final code — the builder should complete Auth.js adapter columns exactly
per the `@auth/drizzle-adapter` Postgres docs current at build time.

```ts
import {
  pgTable, pgEnum, text, uuid, timestamp, integer, jsonb, boolean,
  primaryKey, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['learner', 'admin']);
export const modeEnum = pgEnum('practice_mode', ['lesson', 'live']);
export const errorCategoryEnum = pgEnum('error_category', ['pronunciation', 'grammar', 'vocab']);
export const severityEnum = pgEnum('severity', ['minor', 'moderate', 'major']);
export const cefrEnum = pgEnum('cefr_level', ['A1', 'A2', 'B1', 'B2', 'C1']); // see §9 Q4

// ---- Auth.js-owned tables (shape dictated by @auth/drizzle-adapter) ----
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  // ---- app-specific columns (adapter tolerates extras) ----
  role: roleEnum('role').notNull().default('learner'),
  nativeLang: text('native_lang'),              // BCP-47-ish: 'en', 'es-PY'
  targetLang: text('target_lang'),
  level: cefrEnum('level'),
  languagePairId: uuid('language_pair_id').references(() => languagePairs.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
// accounts, sessions, verification_tokens: copy verbatim from the
// @auth/drizzle-adapter Postgres documentation. Do not improvise these.

// ---- Language-pair config: THE extensibility point (Guaraní = new row) ----
export const languagePairs = pgTable('language_pairs', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),        // 'es-PY>en-speaker', 'en>es-speaker'
  targetLang: text('target_lang').notNull(),    // language being learned
  nativeLang: text('native_lang').notNull(),    // learner's language (tutor explains in this)
  displayName: text('display_name').notNull(),  // 'Spanish (Paraguay)', 'English'
  dialectNotes: text('dialect_notes'),          // e.g. voseo, PY vocabulary — feeds the prompt
  correctionStyle: text('correction_style'),    // tone/strictness guidance — feeds the prompt
  tutorPromptTemplate: text('tutor_prompt_template').notNull(), // full system-prompt template
                                                // with {{dialect_notes}} {{correction_style}}
                                                // {{level}} {{recurring_errors}} {{lesson_context}} slots
  errorTaxonomy: jsonb('error_taxonomy').$type<string[]>().notNull(), // allowed pattern_keys (§10.3)
  ttsVoice: text('tts_voice'),                  // Cloud TTS voice for the TARGET language, e.g.
                                                // 'es-US-Neural2-…' / 'en-US-Neural2-…' (§4.5).
                                                // NULL = no TTS for this pair (e.g. Guaraní later)
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const practiceSessions = pgTable('practice_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  languagePairId: uuid('language_pair_id').notNull().references(() => languagePairs.id),
  mode: modeEnum('mode').notNull(),
  lessonId: uuid('lesson_id').references(() => lessonContent.id), // null for free/live practice
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
}, (t) => [index('ps_user_idx').on(t.userId, t.startedAt)]);

export type UtteranceError = {
  category: 'pronunciation' | 'grammar' | 'vocab';
  severity: 'minor' | 'moderate' | 'major';
  quote: string;          // what the learner said (from transcription)
  correction: string;     // corrected form
  explanation: string;    // short explanation in the learner's native language
  patternKey: string;     // normalized key from language_pairs.errorTaxonomy (§10.3)
};

export const utterances = pgTable('utterances', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => practiceSessions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  speaker: text('speaker').notNull().default('user'), // 'user' | 'tutor' (tutor rows for live transcripts)
  audioRef: text('audio_ref'),                  // always NULL in beta (§9 Q3); ref if storage added later
  transcript: text('transcript'),
  corrected: text('corrected'),
  tutorReply: text('tutor_reply'),
  followUpQuestion: text('follow_up_question'),
  errors: jsonb('errors').$type<UtteranceError[]>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('utt_session_idx').on(t.sessionId)]);

// ---- Aggregated recurring mistakes: powers the dashboard ----
export const errorPatterns = pgTable('error_patterns', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  languagePairId: uuid('language_pair_id').notNull().references(() => languagePairs.id),
  category: errorCategoryEnum('category').notNull(),
  patternKey: text('pattern_key').notNull(),    // e.g. 'ser-vs-estar', 'third-person-s'
  description: text('description').notNull(),   // human-readable, from the latest occurrence
  exampleQuote: text('example_quote'),          // most recent example
  occurrenceCount: integer('occurrence_count').notNull().default(1),
  firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('ep_unique').on(t.userId, t.languagePairId, t.patternKey)]);
// upsert: INSERT ... ON CONFLICT (user_id, language_pair_id, pattern_key)
//         DO UPDATE SET occurrence_count = occurrence_count + 1,
//                       last_seen_at = now(), description = excluded.description,
//                       example_quote = excluded.example_quote

// ---- Owner-supplied curriculum. Imported, never generated. ----
export const lessonContent = pgTable('lesson_content', {
  id: uuid('id').defaultRandom().primaryKey(),
  languagePairId: uuid('language_pair_id').notNull().references(() => languagePairs.id),
  level: cefrEnum('level').notNull(),
  topic: text('topic').notNull(),               // e.g. 'greetings', 'tereré & food'
  title: text('title').notNull(),
  position: integer('position').notNull().default(0), // ordering within level+topic
  content: jsonb('content').notNull(),          // owner-defined shape, see §3.4
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('lc_pair_level_idx').on(t.languagePairId, t.level, t.topic)]);

// ---- Quota early-warning (§6.5) ----
export const usageLog = pgTable('usage_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),                 // 'lesson_attempt' | 'live_minutes' | 'transcript_analysis' | 'tts_chars'
  amount: integer('amount').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('ul_user_day_idx').on(t.userId, t.createdAt)]);
```

Seed data (a Drizzle seed script, run once): two `language_pairs` rows — Paraguayan Spanish for
English speakers, and English for (Paraguayan) Spanish speakers — with `tutorPromptTemplate`,
`dialectNotes`, `correctionStyle`, `errorTaxonomy` filled from §9 Q5's answers. Adding Guaraní
later = a third row + lesson content, nothing else.

### 3.4 `lesson_content.content` JSON shape (provisional — confirm with owner, §9 Q5)

```jsonc
{
  "intro": "Short lesson intro shown to the learner (native language).",
  "vocab": [{ "term": "vos tenés", "gloss": "you have (voseo)", "note": "PY/Río de la Plata" }],
  "exercises": [
    {
      "type": "speak_prompt",           // the only type Phase 3 must support
      "prompt": "Tell me what you did yesterday, using at least two past-tense verbs.",
      "targetHints": ["pretérito", "voseo"]   // passed to Gemini as lesson_context
    }
  ]
}
```
The lesson player iterates `exercises`; each `speak_prompt` runs one record→feedback cycle with
the exercise's `prompt` + `targetHints` sent as `promptContext` to `/api/lesson/attempt`.

---

## 4. Gemini integration

SDK: **`@google/genai`** (the current official JS SDK) for Gemini; plain REST for Cloud TTS.
Two Google projects / three keys (see Phase 0 and the billing trap in §0):

- `GEMINI_API_KEY` — project **A** (billing NEVER linked → keeps the Gemini free tier). Lesson
  mode + transcript analysis.
- `GOOGLE_TTS_API_KEY` — project **B** (billing enabled — Cloud TTS requires it even for the
  free 1M-chars/month allotment; budget alerts keep it $0). API key restricted to the
  Text-to-Speech API only.
- `GEMINI_LIVE_API_KEY` — project **B** as well. Live-mode ephemeral tokens only; created only
  if the owner approves §4.3 option 1.

### 4.1 Lesson mode — `generateContent` with inline audio + structured output

Client: `useRecorder.ts` uses `MediaRecorder` with no forced MIME type; it reports the blob's
**actual** `mimeType` (`audio/webm;codecs=opus` on Chrome/Android, `audio/mp4` on iOS Safari).
Strip codec suffix before sending (`audio/webm`, `audio/mp4` → send `audio/mp4` as `audio/m4a`
if the API rejects `audio/mp4` — builder verifies which of the two the API wants). 90-second cap.

Server (`lib/gemini/lessonFeedback.ts`):

```ts
import { GoogleGenAI, Type } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const feedbackSchema = {
  type: Type.OBJECT,
  properties: {
    transcription: { type: Type.STRING },      // verbatim, in the target language
    errors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category:    { type: Type.STRING, enum: ['pronunciation', 'grammar', 'vocab'] },
          severity:    { type: Type.STRING, enum: ['minor', 'moderate', 'major'] },
          quote:       { type: Type.STRING },
          correction:  { type: Type.STRING },
          explanation: { type: Type.STRING },  // in the learner's NATIVE language
          patternKey:  { type: Type.STRING },  // MUST be one of language_pairs.errorTaxonomy;
        },                                     // taxonomy list is injected into the prompt
        required: ['category', 'severity', 'quote', 'correction', 'explanation', 'patternKey'],
      },
    },
    correctedUtterance: { type: Type.STRING },
    tutorReply:         { type: Type.STRING }, // natural reply, target language
    followUpQuestion:   { type: Type.STRING }, // keeps the conversation going
  },
  required: ['transcription', 'errors', 'correctedUtterance', 'tutorReply', 'followUpQuestion'],
};

export async function getLessonFeedback(args: {
  audioBase64: string; mimeType: string; systemPrompt: string; userTurnContext: string;
}) {
  const res = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [
      { inlineData: { mimeType: args.mimeType, data: args.audioBase64 } },
      { text: args.userTurnContext },  // lesson prompt, targetHints, prior follow-up question
    ],
    config: {
      systemInstruction: args.systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: feedbackSchema,
    },
  });
  return JSON.parse(res.text); // then Zod-validate before trusting it
}
```

System prompt is **assembled, not written**: `lib/gemini/prompts.ts` fills
`language_pairs.tutorPromptTemplate` slots with `dialectNotes`, `correctionStyle`, user `level`,
the user's top ~5 `error_patterns` (so the tutor watches for known weaknesses — this is the
personalization loop), the lesson's `promptContext`, and the pair's `errorTaxonomy` list with an
instruction that every error's `patternKey` MUST come from that list (or `"other"`).

Always Zod-parse Gemini's JSON before persisting; on schema mismatch, retry once, then return a
graceful "couldn't analyze, try again" error. Never store unvalidated model output.

### 4.2 Live mode — client-to-server with ephemeral token

- **Token mint** (`/api/live/token`, server): `@google/genai` client constructed with
  `httpOptions: { apiVersion: 'v1alpha' }` and the project-B key; `ai.authTokens.create({ config:
  { uses: 1, expireTime, newSessionExpireTime, liveConnectConstraints: { model:
  'gemini-3.1-flash-live-preview', config: { responseModalities: ['AUDIO'], systemInstruction,
  inputAudioTranscription: {}, outputAudioTranscription: {} } } } })`. The system instruction is
  assembled from the same `language_pairs` template (live variant slot) — locked server-side so
  the client can't tamper.
- **Client connect**: `ai.live.connect` with the ephemeral token in place of an API key
  (`v1alpha`). Mic capture via `getUserMedia` → `AudioWorklet` (`pcm-worklet.ts`) downsampling to
  **16 kHz mono PCM16** chunks → `sendRealtimeInput` as `audio/pcm;rate=16000`. Playback: queue
  received 24 kHz PCM into an `AudioContext`.
- **Transcripts**: handle `inputTranscription` / `outputTranscription` server messages, render a
  live caption feed, and accumulate turns in memory; on session end POST them to
  `/api/live/session`.
- **Session-length UX (deliberate design, not a bug):** sessions are designed as **~8-minute
  "conversation cafés"**. A visible countdown starts at 8:00; at 7:00 the UI shows "wrap up";
  the client closes gracefully at 8:30 — safely inside both the ~10-min connection cap and the
  ~15-min audio-session cap, so **session resumption is not implemented in this build** (noted
  as a future enhancement). If Google terminates early (`GoAway` message), end gracefully and
  save the transcript as usual.
- iOS note: `AudioContext` must be created/resumed inside the user's tap handler.

### 4.3 ⚠️ THE BILLING CATCH — owner decision required before Phase 7

Ephemeral tokens (`authTokens.create`) **require a billing-enabled Tier-1 project** — they are
not available on the free tier. And a raw API key must never ship to the browser, and Vercel
serverless cannot proxy a WebSocket. So true Live mode cannot be 100 % free with this
architecture. Options:

1. **(Recommended) Use the already-billed project B:** project B exists anyway for Cloud TTS
   (§4.5), so real Live mode needs no new infrastructure — just a Gemini key on project B.
   Cost is usage-based: at 2 users × a few 8-minute sessions/week on a Flash-class live model,
   expect **single-digit dollars per month, likely $1–5** (~$1–3/hour of actual talk time).
   Enforce our own `usage_log` daily cap (e.g. 20 live minutes/user/day); the project-B budget
   alerts (Phase 0) make a surprise impossible.
2. **$0 fallback — "turn-based conversation mode":** reuse the *lesson-mode* pipeline in a free
   conversation loop: user speaks → `generateContent` (free tier) returns tutor reply text →
   the reply is spoken via Cloud TTS Neural2 (§4.5 — same voice as lesson mode, free allotment).
   Feels like walkie-talkie turns, not a live call, but costs nothing and needs no new infra.
   This can even be built as Phase 7-lite first and upgraded to real Live later.
3. Self-hosted WebSocket proxy on a free non-Vercel host (Cloudflare Workers etc.) — **rejected**:
   adds an always-on-ish moving part, another platform, and free-tier CPU/duration risk; it
   contradicts the "no persistent socket on our infra" principle.

**This is §9 Q1.** Phase 7 is written for option 1; option 2 is specced enough in this paragraph
for a builder to implement if chosen.

### 4.4 Post-live transcript analysis (feeds the dashboard from live mode too)

Live transcription yields plain text with no structured errors. `/api/live/session` therefore
runs `transcriptAnalysis.ts`: one **text-only** `gemini-3.5-flash` call (free tier, cheap) with
the user's turns + the same error schema (minus pronunciation, which text can't capture) and the
same `patternKey` taxonomy → upserts `error_patterns`. This keeps the recurring-mistakes
dashboard unified across both modes.

### 4.5 Tutor voice — Google Cloud Text-to-Speech (Neural2)

**Why not the browser's `speechSynthesis`:** Web Speech API voice quality is whatever the
visitor's OS provides — decent on Android/Chrome, but iOS Safari exposes only low-quality
voices (Apple's good ones aren't available to the API), and one of the two beta users is likely
on iPhone. Cloud TTS Neural2 is synthesized server-side, so it sounds identical — and good — on
every device, and its free allotment (1M chars/month) covers thousands of tutor replies at this
scale for $0. Upgrade path if ever wanted: ElevenLabs (better voices, ~$6/mo) — swap inside
`lib/tts.ts` only.

**Implementation (`src/lib/tts.ts`):**

```ts
export async function synthesizeTutorSpeech(text: string, voiceName: string):
  Promise<string | null> {  // base64 MP3, or null on any failure (TTS is never fatal)
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: voiceName.split('-').slice(0, 2).join('-'), name: voiceName },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 }, // slightly slow for learners
      }),
    },
  );
  if (!res.ok) return null;
  return (await res.json()).audioContent; // base64 MP3
}
```

Rules:
- Voice comes from `language_pairs.tts_voice` (target-language voice). If NULL (e.g. a future
  Guaraní pair, which Cloud TTS may not support), skip TTS gracefully — the UI shows text only.
  **This keeps the Guaraní config-only guarantee intact.**
- Called ONLY server-side from `/api/lesson/attempt` (and the §4.3-option-2 conversation loop)
  on model-generated text — never on client-supplied text.
- Synthesize `tutorReply + ' ' + followUpQuestion` as one call (one quota hit, one audio blob).
- Log `tts_chars` in `usage_log`; admin page (§6.5) tracks monthly total vs the 1M free cap.
- Speaking-rate note: consider making `speakingRate` follow user level (0.85 for A1/A2, 1.0 for
  B2+) — nice-to-have, builder's choice in Phase 3.
- **Client playback (iOS-critical):** iOS blocks `audio.play()` outside a user-gesture call
  chain. The lesson flow's Record/Stop button tap starts the async request, so: create ONE
  reusable `Audio` element on first user tap (play a silent buffer to "unlock" it), then set
  `src = 'data:audio/mp3;base64,' + tutorAudioBase64` and play when the response arrives.
  Provide a replay button on the `FeedbackCard`.

---

## 5. Auth.js + Google OAuth

- **Version:** Auth.js v5 (`next-auth@5`) with the App Router pattern: config in `lib/auth.ts`
  exporting `{ handlers, auth, signIn, signOut }`; `app/api/auth/[...nextauth]/route.ts` re-exports
  `handlers`.
- **Provider:** Google OAuth only for the beta (both users have Gmail). Magic-link email is §9 Q2 —
  if wanted, add the Resend provider (free tier: 100 emails/day) in a later phase; the adapter
  tables already support it (`verification_tokens`).
- **Adapter:** `@auth/drizzle-adapter` against the §3.3 schema. **Database sessions** strategy
  (not JWT) — simplest with the adapter, and instant server-side revocation.
- **Role handling:** `role` column exists from day one, default `'learner'`. In the `session`
  callback, copy `user.role`, `user.languagePairId`, `user.level` onto `session.user` (with a TS
  module augmentation for the types). Promote the owner to admin with one manual SQL
  `UPDATE users SET role='admin' WHERE email='<owner email>'` (documented in Phase 2).
- **Route protection:** `src/middleware.ts` — unauthenticated → redirect to `/`;
  `/admin/**` additionally requires `role === 'admin'`; authenticated users without
  `languagePairId` are redirected to `/onboarding` from any `(app)` route.
- **Flow against the schema:** Google sign-in → adapter creates `users` row (email, name, image)
  + `accounts` row (provider tokens) + `sessions` row (cookie `authjs.session-token`). First
  login: `languagePairId` is NULL → middleware forces `/onboarding`, which PATCHes `/api/me`
  with language pair + level. Progress is keyed to `users.id`, so it syncs across any device
  they sign into.
- **Google Cloud console setup** is in Phase 0 (consent screen in **Testing** mode with both
  emails as test users — sufficient for a 2-person beta; the app shows "unverified" only if
  published, which we don't do yet).

---

## 6. Free-tier risk assessment (2-user scale)

| # | Risk | Reality at this scale | Early-warning signal | Mitigation (built into this plan) |
|---|---|---|---|---|
| 6.1 | **Vercel Hobby 10 s default function timeout** — Gemini audio calls take 5–20 s | Would bite on day one | 504s / `FUNCTION_INVOCATION_TIMEOUT` in Vercel logs | `export const maxDuration = 60` on `/api/lesson/attempt` and `/api/live/session` (Hobby allows up to 60 s) |
| 6.2 | **Neon autosuspend** (~5 min idle) → ~0.5–1 s cold start | Noticeable on first request after idle; harmless | First-load latency spikes in Vercel logs after quiet periods | Accept for beta; UI shows loading states. Don't add keep-alive pings (burns Neon compute hours) |
| 6.3 | **Vercel ~4.5 MB request-body limit** | Only if recordings run long | 413 responses | 90 s client-side recording cap (~1 MB Opus) |
| 6.4 | **Gemini free tier: 15 RPM / 1,500 RPD** on `gemini-3.5-flash` | 1,500/day is plenty; 15 RPM could be hit by rapid-fire retries or a runaway client loop | 429 responses with quota error details | §6.5 caps + surface a friendly "daily practice limit reached" state; exponential backoff on 429, never tight-loop retries |
| 6.5 | **No native quota dashboard alerting on free tier** | You find out when you hit the wall | — | `usage_log` table + admin page showing today's counts vs. limits (lesson attempts/user/day capped at e.g. 100; live minutes/user/day capped at 20). This is the early-warning system |
| 6.6 | **Billing trap** (linking billing kills project-A free tier permanently) | Catastrophic for $0 goal if done accidentally | — | Two-project split is mandatory (Phase 0); PLAN states project A must never get billing |
| 6.7 | **Live free-tier: 3 concurrent sessions / ~10-min connections** | 2 users → fine; duration cap is real | Sessions dying at ~10 min | 8-minute session design (§4.2) |
| 6.8 | **Neon 0.5 GB storage** | Text-only rows: years of headroom | Neon dashboard storage graph | No audio blobs in beta (§9 Q3); revisit only if audio storage is approved |
| 6.9 | **Vercel Hobby is for non-commercial use** | Fine for a free 2-person beta | — | Flag: if the app ever charges users, upgrade to Pro ($20/mo) or move hosting |
| 6.10 | **Google OAuth consent screen in Testing mode** | 100-user cap, test users must be listed | New sign-ups fail with `access_denied` | Both beta emails added as test users in Phase 0; publish the consent screen only when opening the beta |
| 6.11 | **Model deprecations** (2.0 models were shut down June 2026; live model is a `-preview`) | `-preview` models can be replaced with short notice | Gemini API changelog; 404/400 "model not found" errors | Model IDs live in env vars (`GEMINI_LESSON_MODEL`, `GEMINI_LIVE_MODEL`), not code, so a swap is a redeploy-free config change |
| 6.12 | **Cloud TTS free allotment (1M Neural2 chars/month) on a BILLED project** — overage bills silently at $16/1M chars | 2 users ≈ 100–300 chars/reply → tens of thousands of chars/month; ~3 % of the cap. Would only bite via a bug (e.g. a retry loop) | `tts_chars` monthly total on the admin page; Google budget alerts ($2, $10) email the owner | `usage_log` tracking + budget alerts (Phase 0 step 4); TTS failures are non-fatal so a quota stop degrades to text-only, never an outage |

---

## 7. PWA + future Android TWA

### 7.1 Beta PWA requirements (Phase 6)

- `public/manifest.webmanifest`: `name` ("Idioma" — placeholder, §9 Q6), `short_name`,
  `start_url: "/dashboard"`, `display: "standalone"`, `background_color`, `theme_color`,
  `id: "/"`, icons **192 and 512 px with `purpose: "maskable"`** (+ any-purpose variants), and
  `apple-touch-icon` link for iOS.
- Service worker via **Serwist** (`@serwist/next` — the maintained successor to next-pwa):
  precache the app shell/static assets; **network-first for pages and ALL `/api/**`** (never
  cache API responses — feedback must be fresh; and never cache `/api/auth/**` at all). Provide
  a minimal offline fallback page ("Idioma needs a connection to hear you 🎙️").
- Install prompts: Android/Chrome fires `beforeinstallprompt` (show a custom "Install" button);
  iOS requires manual "Add to Home Screen" — show a one-time hint.
- Microphone works in installed PWAs on both platforms (HTTPS is given on Vercel). iOS quirk
  reminder: create/resume `AudioContext` inside a tap handler.

### 7.2 What the SW must NOT do

Do not cache POST requests, auth routes, or Gemini responses; do not intercept WebSocket
connections (Live mode traffic bypasses the SW anyway, but don't add routes matching it).

### 7.3 Later: Android TWA via Bubblewrap (documented now, built later — NOT in beta scope)

- One-time $25 Google Play developer fee (the only non-$0 item besides §4.3, and only when
  the owner wants a Play listing).
- Prereqs the beta build already satisfies: valid manifest, SW, HTTPS, installable.
- Added at TWA time: `public/.well-known/assetlinks.json` containing the Play signing-key
  SHA-256 fingerprint (Digital Asset Links — removes the browser chrome). Run
  `bubblewrap init --manifest https://<domain>/manifest.webmanifest`, then `bubblewrap build`.
- What changes for the app: almost nothing — a TWA is Chrome rendering the same deployed site.
  Mic permission piggybacks on Chrome's grant. Passing Play review generally requires the
  offline-fallback page (already built) and decent Lighthouse PWA scores.
- What does NOT change: no separate codebase, no native APIs, updates ship by deploying the web
  app.

---

## 8. Phased build order

Rules for the builder (every phase): work on the branch specified in your session instructions;
one phase per session/PR; run `npm run build` + `npx tsc --noEmit` before committing; each phase
ends with its **acceptance check** passing; do not start a phase whose "blocked by" isn't done.
Update `.env.example` whenever an env var is added.

### Phase 0 — Accounts & keys (OWNER does this by hand; no code)
The owner has **zero** Google/Vercel/Neon setup today. Checklist:
1. **GitHub** repo (exists) connected to **Vercel** (sign up free with GitHub; "Import project";
   framework auto-detected later once Next.js exists).
2. **Neon**: sign up free → create project `idioma` (region: AWS `us-east-1` or `sa-east-1`;
   pick the one closest to Paraguay that Neon offers — `sa-east-1` if available) → copy the
   **pooled connection string** → this becomes `DATABASE_URL`.
3. **Google project A (free Gemini)**: go to **Google AI Studio** (aistudio.google.com) → sign
   in → "Get API key" → **Create API key in a NEW project** (name it `idioma-free`) →
   `GEMINI_API_KEY`. **NEVER link billing to this project.**
4. **Google project B (`idioma-cloud`) — REQUIRED (hosts Cloud TTS; later maybe Live):**
   in console.cloud.google.com create project `idioma-cloud`; link a billing account to **this
   project only** (card required — expected spend $0); create **budget alerts at $2 and $10**
   (Billing → Budgets & alerts); enable the **Cloud Text-to-Speech API** (APIs & Services →
   Library); create an API key (APIs & Services → Credentials) and **restrict it to the
   Text-to-Speech API** → `GOOGLE_TTS_API_KEY`.
   *Only if §9 Q1 = option 1:* also get a Gemini API key tied to this same project via AI Studio
   → `GEMINI_LIVE_API_KEY`.
   ⚠️ Double-check you are in `idioma-cloud`, not `idioma-free`, when linking billing — linking
   billing to `idioma-free` permanently kills its Gemini free tier (§0).
5. **Google OAuth**: console.cloud.google.com → select project (either; suggest `idioma-free`) →
   "APIs & Services → OAuth consent screen": External, app name, owner email; **Publishing
   status: Testing**; add BOTH beta users' Gmail addresses as test users. Then "Credentials →
   Create credentials → OAuth client ID → Web application": authorized origins
   `http://localhost:3000` + `https://<app>.vercel.app`; redirect URIs
   `http://localhost:3000/api/auth/callback/google` +
   `https://<app>.vercel.app/api/auth/callback/google` → `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
6. Generate `AUTH_SECRET` (`npx auth secret` or any 32-byte random string).
7. Put all values in Vercel project → Settings → Environment Variables, and in local `.env.local`.

**Acceptance:** every env var in `.env.example` (Phase 1) has a real value locally and on Vercel.

### Phase 1 — Scaffold + database (blocked by: Phase 0 items 1–2)
Create the Next.js app (App Router, TS, Tailwind, `src/` dir) matching §1; add Drizzle +
`@neondatabase/serverless`; implement the full §3.3 schema incl. Auth.js adapter tables;
`drizzle.config.ts`; generate + run the first migration against Neon; write `scripts/seed.ts`
inserting the two `language_pairs` rows (template text can be placeholder pending §9 Q5);
`.env.example` with all vars (incl. `GEMINI_LESSON_MODEL=gemini-3.5-flash`,
`GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview`, `GOOGLE_TTS_API_KEY`); deploy to Vercel
(blank landing page OK).
**Acceptance:** `npx drizzle-kit migrate` succeeds; seed script runs; deployed URL renders.

### Phase 2 — Auth + onboarding (blocked by: 1)
`lib/auth.ts` (Auth.js v5, Google provider, Drizzle adapter, database sessions, session callback
exposing `role`/`languagePairId`/`level`); auth route; `middleware.ts` per §5; landing page with
"Sign in with Google"; `/onboarding` (choose language pair from `language_pairs` where
`active`, choose CEFR level → PATCH `/api/me`); `/api/me` GET/PATCH; `(app)` shell layout with
nav + sign-out; document the one-line SQL to make the owner admin.
**Acceptance:** both test users can sign in on desktop + phone; new user lands on onboarding
exactly once; `/admin` 403s for learners.

### Phase 3 — Lesson mode core loop (blocked by: 2) ← the product's heart
`useRecorder.ts` + `UtteranceRecorder.tsx` (permission handling, record ≤90 s, real MIME type,
level-meter feedback while recording); `lib/gemini/{client,prompts,lessonFeedback}.ts` per §4.1;
`lib/tts.ts` per §4.5 (builder: list available voices via
`GET https://texttospeech.googleapis.com/v1/voices?key=…`, pick one `es-US` Neural2 and one
`en-US` Neural2 voice, store in the seeded `language_pairs.tts_voice`); `/api/lesson/attempt`
per §2 (incl. `usage_log` daily cap, TTS step, `maxDuration = 60`); free-practice page at
`/lesson` (no curriculum needed yet: one "talk about anything" prompt) rendering `FeedbackCard`
(transcription, color-coded errors by severity, corrected version, tutor reply, follow-up
question) with **auto-played spoken tutor reply + replay button** (iOS audio-unlock pattern,
§4.5) and chaining follow-ups into a continuing session (`practice_sessions` row created on
first utterance, ended on leave).
**Acceptance:** on a real phone (Android Chrome AND iOS Safari), record a Spanish/English
sentence with a deliberate error → structured feedback renders in <25 s AND the tutor's reply
is heard aloud on both phones (incl. iOS); rows appear in `practice_sessions`, `utterances`,
`usage_log` (incl. `tts_chars`); killing the TTS key still returns text feedback (non-fatal
degradation).

### Phase 4 — Error aggregation + dashboard (blocked by: 3)
`lib/errorPatterns.ts` upsert (called from `/api/lesson/attempt`); backfill nothing (beta);
`/api/progress`; `/dashboard` with `ErrorPatternList` (ranked recurring mistakes, per-category
badges, first/last seen, example quote) and `SessionHistory`; inject top-5 patterns into the
lesson prompt (§4.1 personalization loop).
**Acceptance:** making the same mistake in two separate recordings increments one
`error_patterns` row (not two); dashboard shows it; the next lesson's system prompt (log it in
dev) contains the pattern.

### Phase 5 — Curriculum delivery + admin import (blocked by: 3; needs §9 Q5 answered)
Finalize the `content` JSON shape with the owner's real material; `/api/admin/content` +
`/admin/content` UI (paste/upload JSON array, Zod-validated, bulk insert; list + delete);
`/lesson` becomes a lesson browser (level/topic); `/lesson/[lessonId]` `LessonPlayer` walking
`exercises` through the Phase-3 loop with `promptContext`; `/admin` usage page (§6.5: today's
lesson attempts + live minutes per user vs caps).
**Acceptance:** owner imports ≥1 real lesson via the UI; partner completes it end-to-end on her
phone; usage page shows the day's numbers.

### Phase 6 — PWA (blocked by: 2; ideally after 5)
Everything in §7.1–7.2: manifest, icons (generate maskable 192/512 + apple-touch from one
source image the owner provides — §9 Q6), Serwist SW with the §7.1 caching strategy, offline
fallback page, install-hint UI for Android + iOS.
**Acceptance:** Lighthouse "installable" passes; installs to home screen on both phones; app
opens standalone; airplane mode shows the offline page instead of a browser error; API responses
are never served from cache.

### Phase 7 — Live conversation mode (blocked by: 4; GATED on §9 Q1 decision)
If **option 1** (billed project B): §4.2 + §4.4 in full — `/api/live/token`, `liveToken.ts`,
`pcm-worklet.ts`, `useLiveAudio.ts`, `LiveSession.tsx` (connect → talk → live captions →
8-minute countdown → wrap-up → save), `/api/live/session` + `transcriptAnalysis.ts` feeding
`error_patterns`, live-minutes cap in `usage_log`.
If **option 2** ($0 fallback): build `/live` as the turn-based conversation loop described in
§4.3 (2) — reuses `/api/lesson/attempt` with a conversation-style prompt variant (add a
`conversationPromptTemplate` column or template slot to `language_pairs`), plus
`speechSynthesis` playback of `tutorReply`; still writes `utterances`/`error_patterns`.
**Acceptance (opt 1):** full voice conversation in Spanish on a phone; captions live; transcript
+ extracted error patterns in DB after ending; session ends gracefully at the timer; Google
budget alert configured. **(opt 2):** speak → hear the tutor's spoken reply hands-free →
patterns recorded.

### Phase 8 — Polish + beta hardening (blocked by: all)
Error boundaries + retry UX on every Gemini call; loading/empty states; Spanish UI strings for
the partner (simple i18n dictionary — two locales, no library needed); mobile audit of every
screen; 429/timeout friendly messages; README (runbook: local dev, migrate, seed, deploy,
promote-to-admin, import content); TWA runbook per §7.3 left as documented-not-built.
**Acceptance:** both users use the app for a full week without the owner touching a terminal.

---

## 9. Open questions — OWNER must answer before the affected phase

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | **Live mode:** option 1 (real Live API on the already-billed project B, ~$1–5/mo of actual usage) or option 2 ($0 turn-based voice loop with Cloud TTS replies)? See §4.3. Note the billed project exists either way (TTS needs it), so this is now purely "pay ~$1–3/hour of talk time for true real-time, or not". | Phase 0 step 4 (Live key only), Phase 7 | Option 2 ($0) |
| Q2 | Google-only sign-in OK for the beta, or is magic-link email needed too (adds Resend signup)? | Phase 2 | Google-only |
| Q3 | Store learners' audio recordings? Recommendation: **no** for beta (privacy, storage, zero product need — transcripts suffice). If yes later: Cloudflare R2 free tier, `audioRef` column is ready. | Phase 3 | Don't store |
| Q4 | Level system: is CEFR (A1–C1) right, or do you want custom levels (e.g. beginner/intermediate)? Affects the enum + content tagging. | Phase 1 (enum), Phase 5 | CEFR |
| Q5 | Send a **sample of your real lesson material** (even one lesson) so the `content` JSON shape (§3.4) and the two `tutorPromptTemplate` texts (incl. voseo/dialect guidance and correction style/tone) can be finalized. Also: confirm the initial `errorTaxonomy` lists (I can draft ~20 keys per pair for your review — but the wording of tutor behavior is yours to approve). | Phase 5 fully; Phase 1 seed uses placeholders | Placeholders until provided |
| Q6 | App name (placeholder: "Idioma") and a square logo/icon source image; custom domain or `*.vercel.app`? (OAuth consent + manifest + TWA all reference these.) | Phase 0, 6 | "Idioma", generated placeholder icon, vercel.app |
| Q7 | The two model IDs, free-tier numbers, and the "ephemeral tokens need billing" claim came from July-2026 research (partly via Gemini itself). **Builder must re-verify all three against ai.google.dev at Phase 3 / Phase 7 start** and update §0. Confirm you're OK with that re-verification step. | Phases 3, 7 | Re-verify at build time |

---

## 10. Foreseen problems you didn't ask about (+ fixes, already baked in above)

1. **iOS records `audio/mp4`, not `audio/webm`.** A hardcoded MIME type would silently break the
   partner's iPhone (or any iOS device). Fix: recorder reports its real MIME type; server passes
   it through (§4.1). Test matrix in Phase 3 acceptance explicitly includes iOS Safari.
2. **`sessions` table name collision** between Auth.js and the product's "sessions" concept.
   Fix: product tables are `practice_sessions`/`utterances` (§3.2). A builder who misses this
   will corrupt auth — it's called out in the schema twice for that reason.
3. **"Recurring mistakes" won't aggregate by themselves.** Free-text error descriptions never
   match string-for-string, so naive grouping yields one row per occurrence and a useless
   dashboard. Fix: a **controlled `patternKey` taxonomy per language pair** stored in
   `language_pairs.errorTaxonomy`, injected into the prompt, enforced by the response schema,
   upserted with `ON CONFLICT` (§3.3, §4.1). This is the single most important design detail for
   the app's stated long-term value.
4. **Live mode produces no structured errors** — transcripts only. Without §4.4's post-session
   text analysis, live practice would never feed the dashboard, splitting the product in two.
5. **Runaway-cost / runaway-quota protection is our job**, not Google's: free tiers fail closed
   (429s) but a billed project fails *open* (charges). Fix: `usage_log` caps enforced in our API
   (§6.5) + Google budget alerts (Phase 0 step 4). Never retry 429s in a loop.
6. **Gemini output is untrusted input.** Even with a response schema, values can be malformed or
   weird. Fix: Zod-validate every response before persisting; single retry then graceful error
   (§4.1). Also render all model text as text (React default) — never `dangerouslySetInnerHTML`.
7. **Preview-model churn** (`gemini-3.1-flash-live-preview` *will* be renamed or retired
   eventually). Fix: model IDs in env vars (§6.11), so recovery is a dashboard edit, not a
   deploy.
8. **Two-browser reality:** the entire beta happens on exactly two phones (one Android?, one
   iOS?). Every phase's acceptance criteria test on real phones, not desktop — desktop-only
   testing would validate the wrong product. (Owner: confirm which phone models in passing.)
9. **The partner's UI language:** an English-only UI undermines the "Paraguayan learning
   English" experience for a beginner. Fix: tiny two-locale string dictionary in Phase 8 — cheap
   now, painful later.
10. **Vercel Hobby non-commercial clause** (§6.9): fine today; revisit before ever charging
    users or adding ads.

---

*End of PLAN.md. Await owner review. Builders: do not proceed past this line's instructions —
the first coding session starts at the phase the owner names, after "approved, proceed".*
