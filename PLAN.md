# PLAN.md — "Idioma" Language-Learning Web App

**Authored by Fable 5 (planning/architecture model) for handoff to Opus 5.**

**Status: v4 (July 2026). Phases 1–4, 4B, 4C and 7 are built and merged to `main`: scaffold +
schema + seed (Phase 1), auth + onboarding (Phase 2), the lesson-mode core loop (Phase 3),
error aggregation + dashboard (Phase 4), gamification (Phase 4B), the provider-abstraction
audit (Phase 4C), and the turn-based live conversation loop (Phase 7). Everything except
Phase 4C is code complete but UNTESTED live — Phase 0 (the owner's manual accounts/keys
checklist, §8) is still not done and blocks all live verification.**

**What v4 changes:** model tiering moves to Opus 5 (§ below); a real cost model for the three
voice-conversation paths replaces the old "$1–3/hour" guess and adds the tier-gating design
(§15); two defects found by reading the shipped code are recorded and scheduled (§16); a new
Phase 7B covers conversation latency, which is the difference between the live mode feeling
like a chat and feeling like a form; and §9 Q5 now points at a concrete curriculum-generation
prompt pack instead of waiting on the owner indefinitely. The underlying spec (§0–§14) is
unchanged from v2/v3 apart from the model IDs in §0. Builders: read §11–§16 before starting
any phase — they modify the schema (§3.3), prompt assembly (§4.1), and the phase list (§8).**

**What v5 changes (August 2026):** hosting moves from Vercel Hobby to **Hostinger managed
Node.js** (§6.13 — Phase 0, §2, §3.1, §6 and §15 updated to match); the provider/model choice
becomes **admin-editable per task, across Gemini and OpenAI** (§14.4, built); a **third language
pair for Swedish speakers** and a wider tester group are recorded (§9 Q12); and a **$10 Google
credit** is noted where it changes a decision (§15.3). Everything else in §0–§13 is unchanged.

**Business scope (re-confirmed by owner, July 2026): personal beta only.** Idioma serves
exactly two beta users at $0/month. There is NO revenue model, no pricing, no public signup,
and none is planned in this build. "Launch" means both users practicing daily on their phones
without the owner touching a terminal (Phase 8 acceptance). Do not add billing, multi-tenancy,
or marketing surface area.

## Model tiering — who does what

*(Updated v4: Opus 5 has replaced Opus 4.8 as the top implementation tier.)*

- **Fable 5** (this document's author) handles architecture, spec/schema decisions, gap
  analysis, and review gates. Do not burn Fable time on routine implementation. Bring work
  back to Fable when: a phase's acceptance check fails twice for non-obvious reasons, a
  builder believes the spec itself is wrong, or the owner changes scope.
- **Opus 5** executes the build phases (§8) — one phase per session/PR. Use it in particular
  for the phases where a wrong call is expensive to unwind: the Phase 0 live-verification
  session (five untested phases land at once, and the failures will interleave), Phase 5B's
  SRS scheduling logic, Phase 6's service worker against Next.js 16, and Phase 7B's streaming
  rework of the request path. Opus 5 is also the review tier for anything touching money
  (§15) or auth.
- **Sonnet 5** is the right tool for mechanical, well-specced work where the spec is already
  unambiguous — content import plumbing, UI states, the Spanish string dictionary in Phase 8.
  Prefer it when the phase text reads like instructions rather than decisions.

This document is a self-contained build spec. It is written so that a Claude model in a fresh
session, with no memory of the planning conversation, can execute any phase from this document
alone. Read the whole document before starting any phase.

## What's needed to finish — gap analysis (v4, July 2026)

Verified against the actual code on `main` (not just docs) in July 2026:

**Built and merged:**

| Phase | Evidence in repo |
|---|---|
| 1 — Scaffold + database | Full §3.3 Drizzle schema (`src/lib/db/schema.ts`, incl. `error_patterns`), migrations in `drizzle/`, `scripts/seed.ts`, two sample lessons in `content/lessons/` |
| 2 — Auth + onboarding | `src/lib/auth.ts` (Auth.js v5 + Google + Drizzle adapter), `src/proxy.ts`, `/onboarding` with §11.3 coaching-profile capture, `/api/me`, `(app)` shell |
| 3 — Lesson mode core loop | `useRecorder`/`UtteranceRecorder`, `lib/llm/{provider,gemini}.ts` (§14 abstraction), `lib/gemini/*`, `lib/tts.ts`, `/api/lesson/attempt` with `usage_log` caps, `LessonPlayer` + `FeedbackCard` + tutor-audio player |
| 4 — Error aggregation + dashboard | `lib/errorPatterns.ts` (upsert on `(userId, languagePairId, patternKey)`, wired into `/api/lesson/attempt` step ⑥), `lib/progress.ts`, `/api/progress`, `/dashboard` with `ErrorPatternList` (per-category badges, first/last seen, example quote, "conquered" flag) + `SessionHistory` |
| 4B — Gamification core | `lib/gamification.ts` (XP constants, timezone-aware streak + weekly shield), `user_stats` migration, `DailyGoalRing`/`StreakBadge`/`Celebration`/`XpToast`, step ⑦ wired into `/api/lesson/attempt` |
| 4C — Provider-abstraction audit | ESLint `no-restricted-imports` rule enforced and exercised against a deliberate violation — the one fully verified phase in the repo |
| 7 — Live conversation (turn-based) | `ConversationLoop.tsx` + `/live`; backend already existed (`conversation_prompt_template` column, `mode: 'live'` branch, template selection in `prompts.ts`) |

**In review (not yet on `main`):**

| Change | Evidence |
|---|---|
| §14.4 — admin-selectable provider + model, OpenAI adapter | PR #12: `app_settings` table + migration `0003`, `lib/llm/{catalog,settings}.ts`, `lib/llm/openai.ts` + `lib/openai/**`, `/admin` model form, `/api/admin/models{,/test}`. Builds/typechecks/lints; **never run against a live key** |
| §6.13 — hosting moves to Hostinger | PR #12: this document (Phase 0, §2, §3.1, §6, §15, README) |

**Blockers (owner, no code):**

1. **Phase 0 — accounts & keys.** Still untouched, and now blocking *six* code-complete phases
   at once (see §6.13 for the Hostinger-updated checklist). Nothing has ever run against a real Gemini key, a real TTS key, or a real database.
   The next build session after Phase 0 must live-verify the Phase 2/3/4/4B/7 acceptance
   checklists on both phones before anything new is built — and should expect real fallout, not
   a formality. Budget a full session for it.
2. **§9 Q5 — real lesson material.** Still open, but no longer a hard block: the owner-run
   prompt pack at `content/prompts/curriculum-generation.md` (added v4) produces import-ready
   A1/A2 content in three passes. Phase 5 needs one validated batch, not the whole curriculum.

**Remaining build work (estimate: ~7–8 sessions to launch):**

| Session | Phase | Blocked by |
|---|---|---|
| 1 | Live-verify Phases 2–4B + 7 acceptance on real phones (+ fix fallout) — **Opus 5** | Phase 0 |
| 2 | §16 defect fixes: session close-out + TTS monthly cap | Phase 0 (verify against real data) |
| 3 | Phase 5 — curriculum delivery + admin import | Q5 (one validated batch) |
| 4 | Phase 5B — SRS review queue + listening exercises — **Opus 5** | Phases 4, 5 |
| 5 | Phase 6 — PWA (manifest, Serwist SW, install) | Phase 2 (icon source image needed, §9 Q6) |
| 6 | Phase 7B — conversation latency + hands-free turn-taking — **Opus 5** | Phase 7 live-verified |
| 7 | Phase 8 — polish + beta hardening | all |

The two remaining stubs are `/lesson` (becomes a real browser in Phase 5) and the admin usage
page (§6.5, Phase 5). No reusable specs/skills from sibling portfolio repos apply here — this
repo predates them and is self-contained by design; if a sibling later needs an LLM-provider
abstraction or SRS spec, §13–§14 here are the reference, not the other way around.

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
2. **Live conversation mode** (build second): **DECIDED (owner, July 2026) — ships as the $0
   turn-based voice loop**: record → Gemini text reply → Cloud TTS speaks it back (§4.3 option 2).
   True simultaneous real-time voice-to-voice via the Gemini Live API and ephemeral tokens is
   fully specced in §4.2 as a **documented future upgrade** (~$1–3/hour of talk time if ever
   wanted) but is NOT part of this build.

### Product goals (owner, July 2026)

- **End state:** both learners functionally independent in the target language — able to live a
  normal daily life in a Spanish-speaking and an English-speaking country (≈ CEFR B1–B2). The
  app optimizes for real communicative ability, not test scores or engagement metrics.
- **Her priority:** the **confidence to start speaking** English from day one. The single
  biggest risk for her is anxiety-driven silence, not lack of knowledge (§11.3
  `confidence_first` profile).
- **His priority:** **grammar accuracy and listening comprehension** in Spanish (§11.3
  `accuracy_focus` profile + listening exercises, §13/Phase 5B).
- **Same structure both directions:** identical lesson format, pipeline, dashboard, and
  gamification for both learners. Only the coaching *style* differs, and that is per-user data
  (§11.3), never a fork in the code.
- **Habit-forming by design:** lightweight gamification (§12) so both users *want* to come back
  daily. **No ads, ever.** No engagement dark patterns.
- **Every learning feature must trace to evidence** — §11 maps each mechanism in the app to the
  learning-science finding that justifies it. If a proposed feature has no such mapping, it
  doesn't get built.

### Hard constraints (violating any of these is a spec failure)

| Constraint | Detail |
|---|---|
| Hosting | **Hostinger managed Node.js hosting** — one of the owner's 30 Node slots, running `npm run build` + `npm start` as a long-lived process. **DECIDED August 2026**, replacing the original Vercel Hobby plan; rationale, consequences and the migration checklist are in §6.13. A persistent process is now available on our infra, which reopens §4.3 option 3 (a self-hosted WebSocket proxy for true Live mode) — noted, still not built. |
| Cost | **$0/month, confirmed** for the beta. One Google Cloud project carries a billing account (required for Cloud TTS even within its free allotment, §4.5) but stays at $0 spend via free monthly quotas + budget alerts. Live mode ships as the $0 turn-based option (§4.3 — decided); true simultaneous Live API is a documented future upgrade, not built now. **The owner holds a $10 Google credit (v5)** — a buffer, not a budget: it must not become a reason to relax the free-tier caps, since it expires and the caps are what keep spend at $0 afterwards. Where it does change a decision, see §15.3. |
| Stack | Next.js (App Router) + TypeScript + Tailwind. Drizzle ORM. Auth.js with Google OAuth. **This repo pins Next.js 16 (see `next` in package.json), which has real breaking changes from older training data — e.g. `middleware.ts` was renamed to `proxy.ts` (§5). Read `node_modules/next/dist/docs/` before writing App Router code, per AGENTS.md.** |
| Database | **Neon** free tier (decision + tradeoff in §3.1). |
| Curriculum | ALL lesson content is supplied by the owner. **Never generate curriculum content.** Build only the delivery mechanism and an import path. |
| PWA | Manifest + service worker from day one; installable on Android/iOS/desktop; later wrappable as an Android TWA (§7). |
| Extensibility | Language-pair behavior (dialect notes, correction style, tutor prompts) lives in DB config, never hardcoded. |
| Pedagogy | Correction/coaching behavior is driven by the per-user coaching profile (§11.3) and grounded in §11's evidence table. Detected errors are ALWAYS fully recorded; the profile only filters what is *shown/spoken*, never what is *stored*. |
| Gamification | Per §12. **No ads, no paid boosts, no dark patterns** (no guilt notifications, no decay leagues). Rewards tie to effort and mastery only. |
| Model provider | Every LLM call goes through the `lib/llm` provider interface (§14). Google Gemini is the launch provider; swapping later = one new adapter file + an env change, zero route changes. |

### Verified external facts (verified July 2026 — re-verify at build time, see §9 Q7)

These were confirmed against Google's docs/community sources in July 2026. Model names and
quotas change often; the builder should sanity-check them at https://ai.google.dev/gemini-api/docs
before Phase 3 and Phase 7, and update this file if they've drifted.

- **Lesson-mode model:** `gemini-3.6-flash` (launched 21 July 2026; supersedes
  `gemini-3.5-flash`, also behind the `gemini-flash-latest` alias). Multimodal, accepts inline
  audio, supports structured output, supports extended thinking. Free tier: available (Flash
  and Flash-Lite kept free access when Pro models moved behind billing on 1 April 2026);
  roughly **10–15 RPM, 1,500 requests/day** (resets 00:00 US-Pacific). Paid rates, needed only
  for the §15 cost model: **$1.50/1M input, $7.50/1M output**, cached input $0.15/1M, batch
  half price. ⚠️ Thinking tokens bill as **output** — leave extended thinking OFF for the
  per-turn feedback call (it is a structured extraction task, not a reasoning one) and use it
  only for owner-run curriculum generation.
  ⚠️ **Free-tier data caveat:** Google may use free-tier API content to improve its products.
  Acceptable for a two-person personal beta; **not** acceptable the moment there are third-party
  users, which is one of the constraints in §15.3.
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
│   ├── proxy.ts                     # auth guard for /app/** and /admin/** (Next.js 16 renamed
│   │                                #   middleware.ts → proxy.ts / middleware() → proxy(); same
│   │                                #   mechanism, new name — see AGENTS.md, re-verify at build time)
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
│   │   │   ├── review/page.tsx      # daily spaced-repetition review queue (§13, Phase 5B)
│   │   │   ├── live/page.tsx        # turn-based conversation mode (Phase 7, decided §4.3)
│   │   │   └── settings/page.tsx    # profile: langs, level, sign out
│   │   │
│   │   ├── admin/                   # role === 'admin' only (proxy-guarded)
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
│   │       └── admin/content/route.ts
│   │       # Live mode needs no new route (§4.3): reuses lesson/attempt. live/token +
│   │       # live/session only get added if the §4.2 future real-time upgrade is ever built.
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
│   │   │   └── ConversationLoop.tsx     # Phase 7 (decided, §4.3): reuses
│   │   │                                #   UtteranceRecorder + FeedbackCard in a loop,
│   │   │                                #   no lessonId, tutor audio auto-plays.
│   │   │   # LiveSession.tsx / useLiveAudio.ts / pcm-worklet.ts (WebSocket, PCM streaming)
│   │   │   # only get built if the §4.2 future real-time upgrade is ever undertaken.
│   │   ├── gamification/
│   │   │   ├── DailyGoalRing.tsx        # app-shell header: progress toward daily goal (§12)
│   │   │   ├── StreakBadge.tsx          # current streak + milestone states
│   │   │   └── Celebration.tsx          # lesson-complete / milestone moment (confetti etc.)
│   │   └── dashboard/
│   │       ├── ErrorPatternList.tsx
│   │       └── SessionHistory.tsx
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts             # Neon HTTP driver + drizzle instance
│   │   │   └── schema.ts            # ALL tables (§3.3)
│   │   ├── auth.ts                  # Auth.js config (§5)
│   │   ├── llm/
│   │   │   ├── provider.ts          # LlmProvider interface + getProvider() (§14)
│   │   │   └── gemini.ts            # Gemini adapter — the ONLY consumer of lib/gemini/*
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
│   │   ├── gamification.ts          # XP + streak updates, user_stats writes (§12)
│   │   ├── srs.ts                   # SM-2-lite scheduling + review_items enqueue (§13)
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

All routes are Next.js App Router route handlers, served by the long-lived Node process on
Hostinger (§6.13). They were originally specced against Vercel serverless; nothing in the route
code depends on which of the two runs it.

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | — | Auth.js handlers (Google OAuth sign-in/callback/session). |
| `/api/me` | GET | learner | Current user profile incl. `native_lang`, `target_lang`, `level`, `role`, active language pair. |
| `/api/me` | PATCH | learner | Update profile (onboarding sets langs + level; settings edits them). Validates `target_lang` against active `language_pairs`. |
| `/api/lesson/attempt` | POST | learner | **Core route.** Body: `{ audioBase64, mimeType, lessonId?, promptContext? }`. Flow: ① enforce per-user daily cap (§6.5) ② load user + language pair + top recurring `error_patterns` ③ assemble system prompt (§4.1) ④ call Gemini `generateContent` with inline audio + `responseSchema` ⑤ synthesize `tutorReply + " " + followUpQuestion` to MP3 via Cloud TTS (§4.5; non-fatal on failure — return feedback without audio) ⑥ persist utterance + errors, upsert `error_patterns` (which also enqueues/reactivates SRS items, §13.2), log usage (incl. `tts_chars`) ⑦ update `user_stats` — XP + timezone-aware streak/daily-goal (§12; from Phase 4B) ⑧ return the structured feedback JSON + `tutorAudioBase64` (nullable) + `gamification: { xpAwarded, xpTotal, currentStreak, dailyGoalMet }` (nullable pre-4B). TTS is server-side only — the client never sends free text to be synthesized, so the TTS quota can't be abused as a generic synthesizer. `export const maxDuration = 60` is kept as a deliberate no-op on Hostinger (a long-lived Node process has no per-request platform timeout) so the route stays portable back to a serverless host; Gemini audio calls take 5–20 s, which was a day-one blocker under Vercel Hobby's 10 s default and is a non-issue here. |
| `/api/lessons` | GET | learner | List lesson_content for the user's language pair, filtered by `level`/`topic` query params. |
| `/api/lessons/[lessonId]` | GET | learner | One lesson's full content JSON. |
| `/api/progress` | GET | learner | Dashboard payload: `error_patterns` ranked by `occurrence_count` and recency (incl. "conquered" flags, §12.2), per-category counts over time, recent practice sessions with utterance counts, `user_stats` (XP/streak), count of due review items. |
| `/api/review` | GET | learner | Today's due `review_items` for the user's pair, oldest-due first, capped at 10 (§13.4). |
| `/api/review` | POST | learner | Grade one item: `{ itemId, outcome: 'again'\|'good'\|'easy' }` → SM-2-lite reschedule (§13.3), award review XP (§12.2). Spoken review answers themselves go through `/api/lesson/attempt` with `mode: 'review'`; this route only records the resulting grade. |
| `/api/admin/content` | GET/POST/PUT/DELETE | admin | Import/manage `lesson_content`. POST accepts a JSON array of lessons (§3.4 shape) for bulk import — the owner pastes/uploads his own material here. Zod-validates every item. |

**Live mode (Phase 7, decided as the $0 turn-based loop, §4.3) needs NO new route** — it reuses
`/api/lesson/attempt` with `mode: 'live'` and no `lessonId`. The routes below only exist if the
owner later upgrades to the true real-time Live API (§4.2, future/optional, not built now):

| `/api/live/token` *(future upgrade only)* | POST | learner | Ephemeral-token mint. Body: `{ }` (config derived server-side). Flow: ① enforce daily live-minutes cap ② load language pair config ③ `ai.authTokens.create` (`v1alpha`) with `uses: 1`, `newSessionExpireTime` ≈ now+2 min, `expireTime` ≈ now+30 min, and `liveConnectConstraints` locking `model: 'gemini-3.1-flash-live-preview'`, the assembled `systemInstruction`, `responseModalities: ['AUDIO']`, and input/output transcription on ④ create a `practice_sessions` row (mode `live`), return `{ token, sessionId, maxSeconds }`. The browser then connects **directly to Google** — no WebSocket touches our infra. |
| `/api/live/session` *(future upgrade only)* | POST | learner | End-of-live-session save. Body: `{ sessionId, turns: [{ speaker: 'user'\|'tutor', text }] }` (accumulated client-side from Live transcription events). Persists turns as `utterances`, marks the session ended, then runs **text-only** error extraction on the user's turns via `gemini-3.5-flash` (§4.4) and upserts `error_patterns`. |

Notes:
- Audio is sent as base64 JSON rather than multipart to keep the route dead simple. Hostinger's
  Node process imposes no Vercel-style ~4.5 MB body limit, so Gemini's ~20 MB inline-request cap
  is the real ceiling. Keep the 90-second client-side recording cap regardless: it bounds memory,
  latency and cost, and a single utterance never needs more.
- No `/api/live` WebSocket route exists, by design or otherwise: serverless can't hold sockets.
  A future true-Live upgrade would still be browser↔Google direct, never touching our infra.

---

## 3. Database: Neon (Postgres) + Drizzle

### 3.1 Why Neon over Turso

**Recommendation: Neon.** Reasons, in order of weight:

1. **The `error_patterns` dashboard is the product's long-term value**, and it's an aggregation
   workload (group-by, jsonb filtering, upserts with `ON CONFLICT`). Postgres `jsonb` +
   real SQL aggregates fit this natively; SQLite/libSQL stores JSON as text with a thinner
   function set and no native upsert-increment ergonomics for this shape.
2. **Auth.js Drizzle adapter is first-class on Postgres** — the documented, most-trodden path.
3. **Neon's HTTP driver (`@neondatabase/serverless`)** queries over HTTPS instead of a raw
   Postgres TCP connection, so there is no connection-pool management. On Hostinger this turned
   out to be load-bearing rather than merely convenient: Hostinger's servers have broken IPv6
   routing to Neon's endpoints, which breaks TCP-based clients (Prisma's engine, `pg`) but not
   an HTTPS fetch. Do not "optimize" this to a TCP driver without testing from the live host.
4. Enum types, `uuid`, `timestamptz` keep the schema self-documenting.

**The tradeoff (why Turso was tempting):** Neon's free tier **autosuspends compute after ~5
minutes idle**, so the first request after a quiet period pays a ~0.5–1 s DB cold start. (On
Hostinger the Node process itself stays warm, so this is the only cold start in the path, not one
of two — a small win over the original Vercel plan.) Turso has no comparable cold start and a very generous free tier.
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
users 1──1 user_stats             (XP + streaks, §12 — added in Phase 4B)
users 1──N review_items           (spaced repetition, §13 — added in Phase 5B)
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
  // ---- v2 coaching/gamification columns (migration added in Phase 2; §11.3, §12) ----
  coachingProfile: coachingProfileEnum('coaching_profile'), // 'confidence_first' | 'accuracy_focus'
  focusSkills: jsonb('focus_skills').$type<string[]>(),     // e.g. ['grammar','listening']
  timezone: text('timezone'),                   // IANA, e.g. 'America/Asuncion', 'Europe/Stockholm'
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
// export const coachingProfileEnum = pgEnum('coaching_profile', ['confidence_first', 'accuracy_focus']);
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
  kind: text('kind').notNull(),                 // 'lesson_attempt' | 'live_minutes' | 'transcript_analysis' | 'tts_chars' | 'review_grade'
  amount: integer('amount').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('ul_user_day_idx').on(t.userId, t.createdAt)]);

// ---- Gamification (§12 — migration added in Phase 4B) ----
export const userStats = pgTable('user_stats', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  xpTotal: integer('xp_total').notNull().default(0),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastGoalMetDate: text('last_goal_met_date'),  // 'YYYY-MM-DD' in the USER's timezone (§12.2)
  streakShieldUsedInWeek: text('streak_shield_used_in_week'), // ISO week 'YYYY-Www' or NULL
  dailyGoalTarget: integer('daily_goal_target').notNull().default(3), // utterances/day
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
// XP event history is NOT a separate table: usage_log already records every
// metered action, so the weekly recap (§12.2) aggregates usage_log + utterances.

// ---- Spaced repetition (§13 — migration added in Phase 5B) ----
export const reviewItems = pgTable('review_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  languagePairId: uuid('language_pair_id').notNull().references(() => languagePairs.id),
  kind: text('kind').notNull(),                 // 'vocab' | 'error_pattern'
  sourceRef: text('source_ref').notNull(),      // vocab: '<lessonContentId>#<vocabIndex>'; pattern: errorPatterns.id
  front: text('front').notNull(),               // prompt shown/spoken to the learner (native language)
  back: text('back').notNull(),                 // expected production (target language)
  easeFactor: integer('ease_factor_x100').notNull().default(250), // ×100 to avoid float cols
  intervalDays: integer('interval_days').notNull().default(0),
  dueAt: timestamp('due_at').notNull().defaultNow(),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('ri_unique').on(t.userId, t.kind, t.sourceRef),
  index('ri_due_idx').on(t.userId, t.dueAt),
]);
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
    },
    {
      "type": "listen_prompt",          // Phase 5B (§11.1 comprehensible input): listening comprehension
      "audioText": "Ayer fui al mercado y compré chipa y yuyos para el tereré.",
      // ↑ synthesized to speech via Cloud TTS (§4.5) and PLAYED, never displayed
      "prompt": "What did the speaker buy? Answer in a full Spanish sentence.",
      "targetHints": ["listening comprehension", "past tense"]
    }
  ]
}
```
The lesson player iterates `exercises`; each `speak_prompt` runs one record→feedback cycle with
the exercise's `prompt` + `targetHints` sent as `promptContext` to `/api/lesson/attempt`. A
`listen_prompt` (Phase 5B) first plays the TTS-synthesized `audioText` (replayable, max 3 plays
before answering — desirable difficulty, §11.1), then runs the same cycle with `audioText` +
`prompt` in `promptContext` so Gemini can judge comprehension. **The player MUST skip exercise
`type` values it doesn't recognize** (forward compatibility — Phase 3 builds only
`speak_prompt` but must not crash on `listen_prompt` content).

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
    model: 'gemini-3.6-flash',
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

**v2 addition — the `{{coaching_profile}}` slot (§11.3):** prompt assembly also injects the
per-user coaching text derived from `users.coachingProfile` + `users.focusSkills`. This slot is
added to both seeded templates in Phase 2 (update `scripts/seed.ts` and re-seed, or run the
one-line SQL in the Phase 2 notes). The profile texts themselves live in `lib/gemini/prompts.ts`
as two named constants (they are app behavior, not pair-specific data — the same two profiles
apply to every language pair, so they do NOT belong in `language_pairs`). Wording in §11.3.
Note it changes only the tutor's *response style*; the `errors` array must remain complete and
schema-valid in both profiles.

Always Zod-parse Gemini's JSON before persisting; on schema mismatch, retry once, then return a
graceful "couldn't analyze, try again" error. Never store unvalidated model output.

### 4.2 Live mode (real-time, ephemeral-token version) — FUTURE UPGRADE, NOT BUILT NOW

**Decided (§4.3): this build ships the $0 turn-based voice loop (§4.3 option 2) instead.** This
section is kept as a complete, ready-to-build spec for if/when the owner wants to upgrade to
true simultaneous voice-to-voice later — skip it for Phase 7 as currently planned.

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

### 4.3 Live mode: the $0 turn-based conversation loop (BUILD THIS — decided §9 Q1)

**Background on why this exists instead of true real-time Live API:** ephemeral tokens
(`authTokens.create`, §4.2) require a billing-enabled Tier-1 project, a raw API key must never
ship to the browser, and Vercel serverless could not proxy a WebSocket — so a fully free *true*
Live mode wasn't possible with the original architecture. **Note (v5, §6.13):** the WebSocket half
of that argument no longer holds — Hostinger runs a long-lived Node process, so option 3 (a
self-hosted proxy) is now technically available. The cost half still holds: Live audio has no
meaningful free tier (§15), so this stays a paid upgrade, not a free one. The owner chose the $0 path (option 2 below)
over paying ~$1–3/hour for real-time (option 1, §4.2, kept as a documented future upgrade). A
self-hosted WebSocket proxy (option 3) was rejected — it adds an always-on-ish moving part and
contradicts the "no persistent socket on our infra" principle.

**What to build — turn-based voice conversation:** this reuses the lesson-mode pipeline in a
loop with no fixed lesson prompt, framed as free-flowing conversation practice rather than
graded exercises:

1. `/live` page: a single "hold to talk" (or tap-to-start/tap-to-stop) recorder, same
   `UtteranceRecorder`/`useRecorder` component as lesson mode. No countdown/session-length UX is
   needed here (unlike true Live, there's no persistent connection to expire) — session length
   is just "however long the user keeps talking, one turn at a time."
2. On stop: POST to `/api/lesson/attempt` with `mode: 'live'` and a **conversation** system-prompt
   variant (add a `conversationPromptTemplate` slot to `language_pairs`, alongside
   `tutorPromptTemplate` — same dialect/correction-style/error-taxonomy inputs, but instructing
   the model to prioritize natural back-and-forth dialogue over exercise-style correction, and
   to keep replies short/conversational rather than lesson-formal).
3. Response includes the usual structured feedback (§4.1) **plus** the synthesized `tutorReply`
   audio (§4.5) — same as lesson mode, just no `lessonId`/`promptContext`.
4. Client auto-plays the tutor's spoken reply (§4.5 iOS-unlock pattern), shows the follow-up
   question as the prompt for the next turn, and the user taps to respond — a real spoken
   conversation, just walkie-talkie style (one side talks, then the other) instead of both
   sides talking over a live connection.
5. Session bookkeeping is identical to lesson mode: a `practice_sessions` row with
   `mode: 'live'` groups the turns; `utterances` and `error_patterns` populate the dashboard
   exactly as lesson mode does — **no separate `/api/live/session` or transcript-analysis step
   is needed**, because each turn already goes through the full structured-feedback pipeline
   (§4.4's post-hoc text analysis was only needed for the *true* Live API's raw transcripts,
   and doesn't apply here — skip building it for now).
6. Cost: $0. Same free-tier Gemini calls and free Cloud TTS allotment as lesson mode.

### 4.4 Post-live transcript analysis — part of the §4.2 FUTURE UPGRADE ONLY, not built now

Only relevant if/when the owner upgrades to true Live mode (§4.2): that path yields plain-text
transcription with no structured errors, so `/api/live/session` would run `transcriptAnalysis.ts`
— one **text-only** `gemini-3.5-flash` call (free tier, cheap) with the user's turns + the same
error schema (minus pronunciation, which text can't capture) and the same `patternKey` taxonomy
→ upserts `error_patterns`. **Not needed for the turn-based loop actually being built (§4.3)** —
there, every turn already runs the full structured-feedback pipeline directly.

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
  `handlers`. **v5 is still tagged `beta` on npm** (`next-auth@beta`, e.g. `5.0.0-beta.31` — verify
  the latest beta at build time); its `peerDependencies` explicitly list `next: ^16.0.0`, so this
  is the correct choice for this repo's Next 16 pin, not a downgrade risk. Do not install plain
  `next-auth@latest` (currently resolves to the unrelated v4 line).
- **Provider:** Google OAuth only for the beta (both users have Gmail). Magic-link email is §9 Q2 —
  if wanted, add the Resend provider (free tier: 100 emails/day) in a later phase; the adapter
  tables already support it (`verification_tokens`).
- **Adapter:** `@auth/drizzle-adapter` against the §3.3 schema. **Database sessions** strategy
  (not JWT) — simplest with the adapter, and instant server-side revocation.
- **Role handling:** `role` column exists from day one, default `'learner'`. In the `session`
  callback, copy `user.role`, `user.languagePairId`, `user.level` onto `session.user` (with a TS
  module augmentation for the types). Promote the owner to admin with one manual SQL
  `UPDATE users SET role='admin' WHERE email='<owner email>'` (documented in Phase 2).
- **Route protection:** `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`, the
  exported function `middleware` → `proxy`; identical mechanism/timing, verify against
  `node_modules/next/dist/docs` at build time per AGENTS.md — do not use the old file name) —
  unauthenticated → redirect to `/`; `/admin/**` additionally requires `role === 'admin'`;
  authenticated users without `languagePairId` are redirected to `/onboarding` from any
  `(app)` route. Proxy does only this **optimistic** cookie-presence redirect; every route
  handler still re-checks the real session server-side (Next's own auth guidance warns proxy
  must never be the sole authorization layer).
- **Flow against the schema:** Google sign-in → adapter creates `users` row (email, name, image)
  + `accounts` row (provider tokens) + `sessions` row (cookie `authjs.session-token`). First
  login: `languagePairId` is NULL → proxy forces `/onboarding`, which PATCHes `/api/me`
  with language pair + level. Progress is keyed to `users.id`, so it syncs across any device
  they sign into.
- **Google Cloud console setup** is in Phase 0 (consent screen in **Testing** mode with both
  emails as test users — sufficient for a 2-person beta; the app shows "unverified" only if
  published, which we don't do yet).

---

## 6. Free-tier risk assessment (2-user scale)

| # | Risk | Reality at this scale | Early-warning signal | Mitigation (built into this plan) |
|---|---|---|---|---|
| 6.1 | **Long request duration** — Gemini audio calls take 5–20 s | Resolved by the move to Hostinger (§6.13): a long-lived Node process has no per-request platform timeout. This was a day-one blocker under Vercel Hobby's 10 s default | 504s from a reverse proxy if a call ever hangs | Keep `maxDuration = 60` for portability; keep the client-side loading state and single retry |
| 6.2 | **Neon autosuspend** (~5 min idle) → ~0.5–1 s cold start | Noticeable on first request after idle; harmless | First-load latency spikes in Hostinger runtime logs after quiet periods | Accept for beta; UI shows loading states. Don't add keep-alive pings (burns Neon compute hours) |
| 6.3 | **Request-body size** | No platform limit on Hostinger; Gemini's ~20 MB inline cap is the real ceiling | 413 responses (only if a proxy limit is configured) | 90 s client-side recording cap (~1 MB Opus) |
| 6.4 | **Gemini free tier: 15 RPM / 1,500 RPD** on `gemini-3.6-flash` | 1,500/day is plenty; 15 RPM could be hit by rapid-fire retries or a runaway client loop | 429 responses with quota error details | §6.5 caps + surface a friendly "daily practice limit reached" state; exponential backoff on 429, never tight-loop retries |
| 6.5 | **No native quota dashboard alerting on free tier** | You find out when you hit the wall | — | `usage_log` table + admin page showing today's counts vs. limits (lesson attempts/user/day capped at e.g. 100; live minutes/user/day capped at 20). This is the early-warning system |
| 6.6 | **Billing trap** (linking billing kills project-A free tier permanently) | Catastrophic for $0 goal if done accidentally | — | Two-project split is mandatory (Phase 0); PLAN states project A must never get billing |
| 6.7 | *(N/A for this build — only applies if the §4.2 future real-time upgrade is ever built)* Live free-tier: 3 concurrent sessions / ~10-min connections | 2 users → fine; duration cap is real | Sessions dying at ~10 min | 8-minute session design (§4.2) |
| 6.8 | **Neon 0.5 GB storage** | Text-only rows: years of headroom | Neon dashboard storage graph | No audio blobs in beta (§9 Q3); revisit only if audio storage is approved |
| 6.9 | **Hosting slot scarcity** | Uses 1 of the owner's 30 Hostinger Node slots. No non-commercial clause applies (unlike the original Vercel Hobby plan), so charging users later would be a business decision, not a hosting migration | — | Record which account (LATAM/EU/USA) and slot the app occupies during Phase 0 |
| 6.10 | **Google OAuth consent screen in Testing mode** | 100-user cap, test users must be listed | New sign-ups fail with `access_denied` | Both beta emails added as test users in Phase 0; publish the consent screen only when opening the beta |
| 6.11 | **Model deprecations** (2.0 models were shut down June 2026; live model is a `-preview`) | `-preview` models can be replaced with short notice | Gemini API changelog; 404/400 "model not found" errors | Model IDs live in env vars (`GEMINI_LESSON_MODEL`, `GEMINI_LIVE_MODEL`), not code, so a swap is a redeploy-free config change |
| 6.13 | **Hosting change: Vercel → Hostinger** (see §6.13 below) | Net simplification | — | Documented below |
| 6.12 | **Cloud TTS free allotment (1M Neural2 chars/month) on a BILLED project** — overage bills silently at $16/1M chars | 2 users ≈ 100–300 chars/reply → tens of thousands of chars/month; ~3 % of the cap. Would only bite via a bug (e.g. a retry loop) | `tts_chars` monthly total on the admin page; Google budget alerts ($2, $10) email the owner | `usage_log` tracking + budget alerts (Phase 0 step 4); TTS failures are non-fatal so a quota stop degrades to text-only, never an outage |

### 6.13 Hosting: Hostinger managed Node.js (v5 — DECIDED, replaces Vercel Hobby)

**Decision (owner, August 2026):** the app is hosted on **Hostinger managed Node.js hosting**,
where the owner already runs other apps, instead of Vercel Hobby. This overrides the original
§0 hosting constraint. The route code did not change: nothing in it depended on the host.

**What got better:**

| Was a constraint on Vercel | On Hostinger |
|---|---|
| 10 s default function timeout vs 5–20 s Gemini calls | No per-request platform timeout (§6.1) |
| ~4.5 MB request-body limit | No platform limit; Gemini's ~20 MB inline cap is the ceiling (§6.3) |
| Function cold start on top of Neon's | Process stays warm; Neon's autosuspend is the only cold start (§3.1) |
| Non-commercial-use clause | None — charging later is a business decision, not a migration (§6.9) |
| No persistent WebSocket possible | Possible, which reopens §4.3 option 3 (still not built — the *cost* argument against true Live mode stands, §15) |

**What got worse or newly matters:**

1. **A Node slot is consumed** — 1 of 30 across the owner's three accounts (§6.9).
2. **Hostinger's servers have broken IPv6 routing to Neon.** The deployed app is unaffected
   because `@neondatabase/serverless` queries over HTTPS (§3.1 item 3), but **shell tooling is**:
   run `drizzle-kit migrate` and seeds from a local machine, never Hostinger SSH (Phase 0 step 8).
   Never swap the HTTP driver for a TCP one without testing from the live host first.
3. **Env vars live in hPanel and need a redeploy** (not a restart) to take effect. Paste only the
   raw value into the Value field — the whole `KEY=value` string produces `ERR_INVALID_URL`.
4. **`npm`/`npx` are not on the default SSH PATH** if you ever do need the shell:
   `export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH`.

**Still true regardless of host:** the $0/month target, the two-Google-project split, the free-tier
caps in §6, and every acceptance check being run on the two real phones.

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
- Microphone works in installed PWAs on both platforms (HTTPS is given on Hostinger's
  `*.hostingersite.com` URL and on any mapped custom domain). iOS quirk
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
The owner has **zero** Google/Neon setup today. Checklist (updated v5 for Hostinger, §6.13):
1. **Hostinger**: hPanel → Websites → Add Website → **Node.js Apps** → **Import Git Repository**
   → authorize GitHub → pick this repo, branch `main`. Confirm the detected settings: build
   `npm run build`, start `npm start`. Note which account (LATAM/EU/USA) and slot it took (§6.9).
   The `*.hostingersite.com` URL it hands you is the beta URL until a custom domain is mapped —
   starting there is correct, not a shortcut (§9 Q6).
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
   `http://localhost:3000` + `https://<app>.hostingersite.com`; redirect URIs
   `http://localhost:3000/api/auth/callback/google` +
   `https://<app>.hostingersite.com/api/auth/callback/google` → `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`. Add **every** tester's Gmail as a test user, not just the two beta
   users (§9 Q12).
6. Generate `AUTH_SECRET` (`npx auth secret` or any 32-byte random string).
7. Put all values in hPanel → **Environment Variables**, and in local `.env.local`. ⚠️ hPanel's
   form takes Key and Value as separate fields — pasting the whole `KEY=value` string into Value
   produces `ERR_INVALID_URL` at build time. Env var changes need a **redeploy**, not a restart.
8. **Run migrations from your own machine, never Hostinger's SSH shell**: `npx drizzle-kit
   migrate` then `npm run db:seed`, with `DATABASE_URL` set in the local shell. (Hostinger's
   servers have broken IPv6 routing to Neon; the deployed app is fine because it queries over
   HTTPS — §3.1 item 3 — but shell tooling is not.)

**Acceptance:** every env var in `.env.example` has a real value locally and in hPanel; the
Hostinger URL renders the app over HTTPS; a Google sign-in completes; one row exists in
`language_pairs` after seeding.

### Phase 1 — Scaffold + database (blocked by: Phase 0 items 1–2)
Create the Next.js app (App Router, TS, Tailwind, `src/` dir) matching §1; add Drizzle +
`@neondatabase/serverless`; implement the full §3.3 schema incl. Auth.js adapter tables;
`drizzle.config.ts`; generate + run the first migration against Neon; write `scripts/seed.ts`
inserting the two `language_pairs` rows (template text can be placeholder pending §9 Q5);
`.env.example` with all vars (incl. `GEMINI_LESSON_MODEL=gemini-3.6-flash`,
`GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview`, `GOOGLE_TTS_API_KEY`); deploy to Hostinger
(blank landing page OK).
**Acceptance:** `npx drizzle-kit migrate` succeeds; seed script runs; deployed URL renders.

### Phase 2 — Auth + onboarding (blocked by: 1) — CODE COMPLETE, untested pending Phase 0
All items below are implemented and pass `npm run build` + `npx tsc --noEmit` + `npm run lint`
against placeholder env vars. **Not yet live-tested** — that needs real Neon/Google credentials
(Phase 0, still the owner's open item). Next builder: once Phase 0 is done, run
`npx drizzle-kit migrate`, `npm run db:seed`, then walk the acceptance checklist below on both
phones before starting Phase 3.

`lib/auth.ts` (Auth.js v5, Google provider, Drizzle adapter, database sessions, session callback
exposing `role`/`languagePairId`/`level`); auth route; `proxy.ts` per §5; landing page with
"Sign in with Google"; `/onboarding` (choose language pair from `language_pairs` where
`active`, choose CEFR level, **plus the v2 coaching questions (§11.3): coaching profile
("I want gentle encouragement — help me dare to speak" → `confidence_first` / "Correct
everything and tell me why" → `accuracy_focus`), focus skills (multi-pick from
speaking-confidence / grammar / listening / pronunciation / vocabulary), and timezone
(auto-detect via `Intl.DateTimeFormat().resolvedOptions().timeZone`, confirmable)** → PATCH
`/api/me`); migration adding `users.coachingProfile/focusSkills/timezone` (§3.3); add the
`{{coaching_profile}}` slot to both seeded prompt templates (§4.1); `/api/me` GET/PATCH;
`(app)` shell layout with nav + sign-out; document the one-line SQL to make the owner admin.
**Acceptance:** both test users can sign in on desktop + phone; new user lands on onboarding
exactly once and their coaching answers persist on `users`; `/admin` 403s for learners.

### Phase 3 — Lesson mode core loop (blocked by: 2) ← the product's heart — CODE COMPLETE, untested pending Phase 0
Same caveat as Phase 2: implemented and passing `npm run build` (with a fully empty
environment, matching an unconfigured host pre-Phase-0) + `npx tsc --noEmit` + `npm run lint`, but the
Gemini call, TTS synthesis, and recording flow have never run against real credentials or a
real phone. `language_pairs.tts_voice` was seeded with a best-guess Neural2 voice name from
Google's documented catalog, not verified against the live `/v1/voices` endpoint — low risk
since TTS failures are non-fatal (degrades to text-only), but re-verify at Phase 0.

`useRecorder.ts` + `UtteranceRecorder.tsx` (permission handling, record ≤90 s, real MIME type,
level-meter feedback while recording); `lib/llm/{provider,gemini}.ts` per §14 (routes call the
interface, never `@google/genai` directly); `lib/gemini/{client,prompts,lessonFeedback}.ts` per
§4.1 incl. the `{{coaching_profile}}` slot (§11.3) and the profile-aware `FeedbackCard`
presentation (§11.4);
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

### Phase 4B — Gamification core (blocked by: 3; build right after 4) ← §12 — CODE COMPLETE, untested pending Phase 0
Same caveat as Phases 2–4: passes `npm run build` (empty environment) + `tsc --noEmit` +
`eslint`, and the pure streak/shield transition logic was hand-verified in isolation against
the exact acceptance scenarios below (consecutive days, single-day-shield-save, shield
exhaustion within an ISO week, wider gaps resetting) — but nothing has run against a real
database yet. Also implements the §12.2 couple mechanic (`getPartnerStreak`, gated by
`SHOW_PARTNER_STREAK`), one increment beyond this phase's explicit deliverable list, since it
had no schema cost and completes §12 cleanly.

Migration: `user_stats` table (§3.3); `lib/gamification.ts` (XP rules from the §12.2 constants
table — keep values in ONE exported constants object; timezone-aware streak/daily-goal update
using `users.timezone`; weekly auto streak-shield); wire step ⑦ into `/api/lesson/attempt`
(§2); `DailyGoalRing` + `StreakBadge` in the `(app)` shell header; `Celebration` on lesson
completion and streak milestones (7/30/100); XP toast after each turn; "mistakes conquered"
flag in the `/api/progress` payload + dashboard (§12.2).
**Acceptance:** with dev-faked dates: meeting the daily goal on two consecutive days shows
streak 2; skipping one day with the shield unused keeps the streak and consumes the shield;
skipping two days resets it; XP visibly increments after each recorded turn on a real phone;
lesson completion triggers the celebration; an error pattern untouched for >14 days with ≥3
occurrences renders as "conquered".

### Phase 4C — Provider-abstraction audit (tiny; blocked by: 3) ← §14 — DONE
Not a build phase so much as an enforced checkpoint: verify no file outside `lib/llm/` +
`lib/gemini/` imports `@google/genai` (add the ESLint `no-restricted-imports` rule from §14.3
so it stays true); verify `LLM_PROVIDER=gemini` env switch exists and `.env.example` documents
it. Fold into Phase 4B's PR if trivial.
**Acceptance:** the ESLint rule fails the build when a route imports `@google/genai` directly.
Verified directly: a deliberately violating file outside `lib/gemini/**` was added, confirmed
`npm run lint` fails on it with the rule's message, then removed. Audit found the codebase
already compliant (only `lib/gemini/client.ts` and `lib/gemini/lessonFeedback.ts` import the
SDK) - this phase only had to add the enforcement, not fix a violation. This is a fully
verified phase, not just build/lint-clean - the acceptance check itself was exercised.

### Phase 5 — Curriculum delivery + admin import (blocked by: 3; needs §9 Q5 answered)
Finalize the `content` JSON shape with the owner's real material; `/api/admin/content` +
`/admin/content` UI (paste/upload JSON array, Zod-validated, bulk insert; list + delete);
`/lesson` becomes a lesson browser (level/topic); `/lesson/[lessonId]` `LessonPlayer` walking
`exercises` through the Phase-3 loop with `promptContext`; `/admin` usage page (§6.5: today's
lesson attempts + live minutes per user vs caps).
**Acceptance:** owner imports ≥1 real lesson via the UI; partner completes it end-to-end on her
phone; usage page shows the day's numbers.

### Phase 5B — Spaced-repetition review queue + listening exercises (blocked by: 4, 5) ← §13
Migration: `review_items` (§3.3) + add `'review'` to the `practice_mode` enum; `lib/srs.ts`
(SM-2-lite per §13.3; enqueue-on-lesson-complete for vocab; enqueue/reactivate from the
`error_patterns` upsert per §13.2); `/api/review` GET/POST (§2); `/review` page (§13.4 spoken
review loop, text-answer fallback); review-count nudge on the dashboard ("5 reviews waiting —
2 minutes"); `listen_prompt` exercise support in the lesson player (§3.4: TTS-play `audioText`,
≤3 replays, then the normal record→feedback cycle).
**Acceptance:** completing a lesson enqueues its vocab as due-now items; answering an item
wrong reschedules it ~10 min out and correct schedules ≥1 day out with growing intervals on
repeat successes; a 5-item review round completes end-to-end by voice on a real phone; a
`listen_prompt` exercise plays audio without displaying `audioText` and grades the spoken
answer; review grades award XP and count toward the daily goal.

### Phase 6 — PWA (blocked by: 2; ideally after 5)
Everything in §7.1–7.2: manifest, icons (generate maskable 192/512 + apple-touch from one
source image the owner provides — §9 Q6), Serwist SW with the §7.1 caching strategy, offline
fallback page, install-hint UI for Android + iOS.
**Acceptance:** Lighthouse "installable" passes; installs to home screen on both phones; app
opens standalone; airplane mode shows the offline page instead of a browser error; API responses
are never served from cache.

### Phase 7 — Live conversation mode: turn-based voice loop (blocked by: 4; DECIDED, §9 Q1 = $0) — CODE COMPLETE, untested pending Phase 0
Same caveat as Phases 2–4B: passes `npm run build` (empty environment) + `tsc --noEmit` +
`eslint`, but never run against a real database/Gemini key. Notably light-touch: the backend
(`conversationPromptTemplate` column, `/api/lesson/attempt`'s `mode` branch, prompt assembly's
template selection) was ALREADY fully built in Phases 1/3 - this phase only needed the
frontend (`ConversationLoop.tsx` + `/live` page + nav link).

Build `/live` per §4.3: add a `conversationPromptTemplate` slot to `language_pairs`; `ConversationLoop.tsx`
reusing `UtteranceRecorder`/`FeedbackCard` in a loop with no `lessonId`; POST to
`/api/lesson/attempt` with `mode: 'live'`; auto-play the synthesized `tutorReply` audio (§4.5)
and surface the follow-up question as the next prompt; `practice_sessions` row with `mode: 'live'`
groups the turns. No new API routes, no `transcriptAnalysis.ts`, no ephemeral tokens — this mode
is a thin wrapper around the already-built lesson pipeline.
**Acceptance:** speak → hear the tutor's spoken reply hands-free → tap to respond → repeat for
several turns; `utterances`/`error_patterns` populate from live-mode turns exactly as from lesson
mode; cost stays $0 (verify via the admin usage page, §6.5).

*(Future upgrade, not part of this build: true real-time voice-to-voice via the Gemini Live API
— fully specced in §4.2 + §4.4, gated on billing, **~$0.90/hour of talk time** per the §15 cost
model. Revisit only if Phase 7B's latency work proves insufficient.)*

### Phase 7B — Conversation latency + hands-free turn-taking (blocked by: 7 live-verified) ← §15.2
The turn-based loop works but is **fully serial**: record → base64 upload → one Gemini call that
generates transcription + errors + correction + reply + follow-up → *then* a Cloud TTS round trip
→ *then* the response reaches the client. Nothing is heard until all of it finishes. That is the
difference between a conversation and a form, and it costs **$0 to fix** — it is engineering, not
spend (§15.1). Do this before considering the Live API upgrade (§4.2), not after.

Three changes, in order of payoff:

1. **Speak before you analyze.** Split the per-turn work so audio starts flowing at the earliest
   possible moment. Either stream the model response and fire `synthesizeTutorSpeech` as soon as
   `tutorReply` is complete, or split into two calls: a short conversational-reply call whose
   output goes straight to TTS, and the full structured-feedback call. Persisting utterances,
   `error_patterns`, usage and gamification must move off the response path into Next.js 16's
   `after()` so the client is never waiting on database writes. **Constraint: the response
   contract to the client must not change** — `FeedbackCard` and `ConversationLoop` consume
   `LessonAttemptResponse`, and the mode's whole value is that live turns feed the same
   dashboard as lesson turns (§4.3 point 5). If you split into two calls, both still populate
   the same `utterances` row.
2. **Hands-free turn-taking.** `useRecorder` already runs an `AnalyserNode` for the level meter.
   Use it for silence detection: auto-stop after ~1.5 s below a noise-floor threshold (calibrate
   the floor from the first ~300 ms of the recording, don't hardcode it), with a visible
   countdown so the learner can see it coming and a manual stop that always wins. Gate it behind
   a per-user setting, default ON in `/live` and OFF in `/lesson` (in a graded exercise, a
   thinking pause must not end the turn).
3. **Don't re-upload silence.** The 90 s cap is a safety limit, not a target. Trim leading and
   trailing silence client-side before base64-encoding — it cuts upload time on a phone
   connection and cuts audio input tokens, which is the one part of the request that scales with
   recording length.

**Acceptance:** measured on a real phone on mobile data, median time from "stop talking" to
"first audio out of the speaker" is **under 4 s** (measure it — log timestamps, don't estimate);
a full turn completes hands-free with no taps between turns in `/live`; `utterances`,
`error_patterns` and `user_stats` rows are identical to what the serial path produced (verify by
comparing a lesson-mode turn and a live-mode turn on the same sentence); killing TTS still
returns text feedback.

### Phase 8 — Polish + beta hardening (blocked by: all)
Error boundaries + retry UX on every Gemini call; loading/empty states; Spanish UI strings for
the partner (simple i18n dictionary — two locales, no library needed); mobile audit of every
screen; 429/timeout friendly messages; **weekly recap card on the dashboard (§12.2: utterances,
practice days, top conquered mistake, XP vs last week — computed from `usage_log` +
`utterances`, no new tables); partner-streak display (§12.2 couple mechanic)**; README (runbook:
local dev, migrate, seed, deploy, promote-to-admin, import content); TWA runbook per §7.3 left
as documented-not-built.
**Acceptance:** both users use the app for a full week without the owner touching a terminal.

---

## 9. Open questions — OWNER must answer before the affected phase

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | ~~**Live mode:** option 1 vs option 2~~ | — | **DECIDED (owner, July 2026): option 2 — the $0 turn-based voice loop (§4.3).** True real-time Live API (§4.2) is documented but deferred indefinitely; only revisit if explicitly requested. |
| Q2 | ~~Google-only sign-in vs email+password?~~ | — | **DECIDED (owner): Google OAuth only**, as originally speced in §5. No Credentials provider, no password reset flow to build. |
| Q3 | ~~Store learners' audio recordings?~~ | — | **DECIDED (owner): don't store audio.** Transcripts suffice; `audioRef` column stays NULL. If ever revisited: Cloudflare R2 free tier is the path, column is ready. |
| Q4 | ~~CEFR vs custom levels?~~ | — | **DECIDED (owner): CEFR**, `cefrEnum` stays A1–C1 (§3.3, no schema change needed). Content-authoring order: **owner writes A1 + A2 lesson content first** (Phase 5); B1/B2/C1 rows get added later once A1/A2 are solid. The enum already supports all 5 from day one — this is purely a content-writing sequencing choice, not an architecture one. |
| Q5 | **PARTIALLY RESOLVED (v4):** the owner authors the curriculum with Gemini's help (§9 Q11 allows this — the app still never generates content at request time). The three-pass prompt pack lives at **`content/prompts/curriculum-generation.md`** and emits import-ready JSON matching §3.4. **What's still needed from the owner:** run pass 1 for each language pair, *edit the map by hand* (that pass is where owner judgment actually matters), then generate + validate one A1 batch. Phase 5 needs only that first batch. Still open separately: approve the two `tutorPromptTemplate` wordings and the seeded `errorTaxonomy` lists in `scripts/seed.ts`. | Phase 5 (needs 1 validated batch) | Sample lessons remain in place; lesson browser shows placeholders |
| Q6 | ~~App name + domain?~~ | — | **DECIDED (owner): name = "Idioma", domain = `idioma.com.py`** (available; chosen partly for SEO — "idioma" is a real Spanish search term, generic enough to cover future language pairs beyond ES/EN/Guaraní). Logo/icon source image still needed before Phase 6. **Domain registration note:** `.com.py` typically wants a local Paraguay contact/presence and can take time to register (~30 days per some registrars) — start this in Phase 0, not Phase 6, so it's ready by launch. **Start on the `*.hostingersite.com` URL Hostinger issues (decided v5)** — waiting ~30 days for `.com.py` before letting testers in would be the actual mistake. Moving later costs ~10 minutes in exactly three places: the Google OAuth authorized origins + redirect URIs (§5, Phase 0 step 5), the `AUTH_URL` env var in hPanel (then redeploy), and the PWA manifest `start_url`/`id` (§7.1). One caveat: anyone who *installed* the PWA from the temporary URL must reinstall after the move. |
| Q7 | The two model IDs, free-tier numbers, and the "ephemeral tokens need billing" claim came from July-2026 research (partly via Gemini itself). **Builder must re-verify all three against ai.google.dev at Phase 3 / Phase 7 start** and update §0. Confirm you're OK with that re-verification step. | Phases 3, 7 | Re-verify at build time |
| Q8 | ~~Gamification?~~ | — | **DECIDED (owner, July 2026): yes — §12.** Streaks, XP, daily goal, celebrations. **No ads, ever**; no dark patterns. |
| Q9 | ~~Per-learner coaching focus?~~ | — | **DECIDED (owner, July 2026):** her = confidence to start speaking (`confidence_first`); him = grammar accuracy + listening (`accuracy_focus`). Same lesson structure and pipeline in both directions — only the coaching style differs, per user (§11.3). Profiles are user-choosable at onboarding, not hardcoded to the two people. |
| Q10 | ~~Locked to Google?~~ | — | **DECIDED (owner, July 2026):** Google (Gemini + Cloud TTS) at launch, but all LLM calls go through the §14 provider interface so another model (e.g. Claude) can be swapped in later via one adapter + env change. |
| Q12 | ~~Who tests the beta, and in which languages?~~ | — | **DECIDED (owner, August 2026): more than two.** The owner's partner (learning English) plus the owner's Swedish-speaking parents (learning Spanish). Two consequences. **(a) A third language pair `sv→es` is needed** — by design that is *one new row in `language_pairs`* plus lesson content and a Swedish-language `tutorPromptTemplate`/`conversationPromptTemplate`, and **zero code changes** (§0 extensibility constraint; the same guarantee written for Guaraní). The UI stays English until the Phase 8 locale dictionary (§10 item 9), which now has three locales to consider, not two. **(b) The free-tier data caveat in §0 now applies to people who are not the owner** — Google may use free-tier API content to improve its products, and the content here is family members' voice recordings. This was explicitly called "not acceptable the moment there are third-party users". Family is a grey zone; the owner should make that call knowingly rather than by default. Quota-wise 5 users is still far inside the 1,500 RPD cap. |
| Q11 | ~~Target outcome?~~ | — | **DECIDED (owner, July 2026):** functional independence in daily life in a Spanish- and an English-speaking country (≈ CEFR B1–B2). Curriculum authored by the owner (using Gemini) should aim there; the two Claude-authored demo lessons in `content/lessons/` are placeholder super-basics only. |

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
10. ~~**Vercel Hobby non-commercial clause**~~ — moot since the move to Hostinger (§6.13): there
    is no non-commercial restriction on a Hostinger Node slot. What replaced it is slot scarcity
    (§6.9). (Ads remain ruled out permanently by §12.1 regardless.)
11. **Gamification can backfire.** Rewarding streaks harder than learning invites hollow
    grinding; shame-flavored mechanics (guilt notifications, decaying leagues) would directly
    attack the confidence goal for the anxious learner. §12.1's design rules exist to prevent
    both — builders must not add mechanics beyond §12.2 without an owner decision.
12. **The two learners need different coaching, but a forked app would rot.** The temptation is
    `if (user === her)`. The fix is §11.3: coaching profiles are per-user DATA feeding one
    prompt-assembly path; any future user picks a profile at onboarding.

---

## 11. Learning science & coaching layer (v2)

The owner's requirement: "use the top science for how to learn and coach." This section maps
each mechanism in the app to the research finding that justifies it, and defines the per-user
coaching profiles. **Rule: a learning feature that can't be added to table §11.1 doesn't get
built.**

### 11.1 Evidence → feature map

| Principle (research) | What it says | Where it lives in Idioma |
|---|---|---|
| **Retrieval practice / testing effect** (Roediger & Karpicke 2008) | Actively producing from memory beats re-reading/recognition by a wide margin | Every exercise demands *spoken production*; the review queue (§13) asks the learner to SAY the answer, never to pick from options |
| **Spaced repetition** (Ebbinghaus; Cepeda et al. 2006) | Expanding review intervals flatten the forgetting curve | §13: SM-2-lite scheduling over lesson vocab AND the learner's own recurring mistakes |
| **Comprehensible input, "i+1"** (Krashen) | Acquisition comes from input slightly above current level | Tutor replies pitched to `{{level}}`; TTS `speakingRate` slowed for A1/A2 (§4.5); `listen_prompt` exercises (§3.4, Phase 5B) |
| **Pushed output** (Swain) + **interaction hypothesis** (Long) | Being made to produce, and negotiating meaning in interaction, drive acquisition | The record→feedback→`followUpQuestion` loop forces output and keeps a real exchange going every turn |
| **Corrective-feedback research** (Lyster & Ranta 1997; Li 2010 meta-analysis) | Explicit metalinguistic feedback beats recasts for grammar accuracy — but selective correction protects willingness to communicate in anxious beginners | The two coaching profiles (§11.3): `accuracy_focus` gets explicit corrections + the rule; `confidence_first` gets recasts + capped explicit corrections |
| **Affective filter** (Krashen) / **willingness to communicate** (MacIntyre) | Anxiety measurably suppresses acquisition and speaking attempts | `confidence_first` profile; §12.1's ban on shame mechanics; praise must be *specific*, not generic |
| **Desirable difficulties** (Bjork) | Learning sticks when effortful (but not overwhelming) | Prompts pitched slightly above comfort; listening replays capped at 3; hints exist but aren't shown by default |
| **Habit formation** (Lally et al. 2010; implementation intentions, Gollwitzer) | Small consistent daily practice beats bingeing; cues + visible progress sustain habits | Daily goal + streak (§12); the review queue gives a guaranteed-short "2-minute" re-entry point on busy days |

### 11.2 Where coaching behavior lives

Correction/coaching behavior is **data + prompt assembly, never branching code**: language-pair
tone lives in `language_pairs.correctionStyle` (per pair), and learner-specific style lives in
`users.coachingProfile` + `users.focusSkills` (per user), injected via the
`{{coaching_profile}}` slot (§4.1). One pipeline serves both learners and any future user.

### 11.3 Coaching profiles (per USER — chosen at onboarding, editable in settings)

`users.coachingProfile`: `'confidence_first' | 'accuracy_focus'`.
`users.focusSkills`: subset of `['speaking-confidence', 'grammar', 'listening',
'pronunciation', 'vocabulary']`.

**`confidence_first`** (her starting choice — anyone can pick it): prompt text instructs the
tutor to:
- open `tutorReply` by naming *specifically* what the learner communicated successfully;
- explicitly correct only the 1–2 highest-severity errors per turn; fold all other corrections
  into the reply as **recasts** (model the correct form naturally, without flagging it);
- never re-correct the same minor slip twice in one session;
- keep the follow-up question inviting and answerable at the learner's level.

**`accuracy_focus`** (his starting choice): prompt text instructs the tutor to:
- report every real error explicitly with a one-line metalinguistic explanation (the *rule*,
  not just the fixed form);
- craft the `followUpQuestion` to **elicit the corrected structure again** in the learner's
  next turn (elicitation — the strongest feedback type in Lyster & Ranta's data);
- still react to the *content* of what was said; a grammar coach who ignores meaning kills the
  conversation.

**Invariant (both profiles):** the structured `errors` array is always complete and
schema-valid. Profiles filter what the tutor *says and shows*, never what the app *records* —
the dashboard, `error_patterns`, and SRS see everything either way.

`focusSkills` effects: `listening` weights `listen_prompt` exercises into "suggested next"
ordering (Phase 5B); `grammar` biases the top-5 recurring-errors slot toward grammar-category
patterns; `speaking-confidence` is informational for the prompt ("this learner's stated goal is
daring to speak").

### 11.4 Feedback UI follows the profile

One `FeedbackCard` component with a profile prop: `confidence_first` renders the praise line
first and collapses the error list behind "N things to polish — tap to see";
`accuracy_focus` expands errors by default with the explanation visible. No forked components.

---

## 12. Gamification (v2)

### 12.1 Design rules (non-negotiable)

1. Reward **showing up + effort** (turns spoken, streaks) and **mastery** (mistakes conquered)
   — never engagement for its own sake.
2. **No ads, ever.** No paid boosts.
3. **No dark patterns:** no guilt/shame notifications, no decaying leagues, no fake scarcity.
   A missed day is met with a warm re-entry ("pick up where you left off"), not a crying owl.
4. The dopamine moments celebrate *learning* (finished lesson, conquered mistake, streak
   milestone), so the reward loop reinforces the actual goal (§11.1 habit-formation row).

### 12.2 Mechanics (all values live in ONE exported constants object in `lib/gamification.ts`)

| Mechanic | Spec |
|---|---|
| **XP** | +10 per completed spoken turn; +5 bonus for a zero-error turn; +25 lesson completed; +5 per review item graded; +15 daily goal met. Shown as a small toast after each turn; total on dashboard. |
| **Daily goal** | Default 3 spoken turns/day (`user_stats.dailyGoalTarget`, user-editable). `DailyGoalRing` in the app-shell header fills as turns complete. Review items count toward it. |
| **Streak** | A day counts when the daily goal is met, computed in the USER's timezone (`users.timezone` — Asunción and Stockholm are 5–6 h apart; server UTC dates would corrupt both). `current`/`longest` on dashboard; milestone celebrations at 7/30/100. |
| **Streak shield** | ONE automatic shield per ISO week: the first missed day is silently bridged (`user_stats.streakShieldUsedInWeek`). Protects the habit from a busy day without nagging. Not purchasable, not stackable. |
| **Mistakes conquered** | An `error_patterns` row with ≥3 occurrences and `lastSeenAt` > 14 days ago renders as "conquered ✅" on the dashboard. The highest-value dopamine hit in the app — it is *proof of learning*. Un-conquers automatically if the pattern recurs. |
| **Celebrations** | `Celebration.tsx` on lesson completion and streak milestones. Short (<2 s), skippable, no sound by default. |
| **Couple mechanic** | Dashboard shows the partner's current streak next to yours (beta has exactly two users — render the other user's streak behind a simple env/config flag). Gentle mutual accountability, no competition mechanics. |
| **Weekly recap** (Phase 8) | Dashboard card: turns spoken, practice days, top conquered mistake, XP vs last week. Aggregated from `usage_log` + `utterances` — no new tables. |

### 12.3 Data

`user_stats` (§3.3): one row per user, updated transactionally in step ⑦ of
`/api/lesson/attempt` and on `/api/review` POST via `lib/gamification.ts`. XP history is not
stored separately — `usage_log` already records every metered action with timestamps, which is
enough for the weekly recap.

---

## 13. Spaced-repetition review queue (v2)

### 13.1 Why

Spacing and retrieval are the two most robust effects in the learning literature (§11.1), and
the app already harvests exactly the right material: lesson vocab and the learner's OWN
recurring mistakes. This also supplies the "guaranteed-short daily re-entry point" the habit
loop needs (§12.2 daily goal on busy days).

### 13.2 Item sources (`review_items`, schema in §3.3)

- **Vocab:** completing a lesson enqueues each `content.vocab[]` entry as a due-now item
  (`front` = gloss + note in the native language, `back` = the target-language term,
  `sourceRef` = `<lessonContentId>#<index>`). Idempotent via the unique index.
- **Error patterns:** every `error_patterns` upsert (§4.1 pipeline) enqueues or *reactivates*
  the pattern's item — if the pattern recurred, set `dueAt = now()` regardless of schedule
  (`front` = an elicitation prompt for the structure, e.g. "Say: *she works on Mondays*" for
  `third-person-s`; `back` = the corrected example). Generated from the pattern's stored
  `description`/`exampleQuote` — no extra LLM call.

### 13.3 Scheduling — SM-2-lite (deliberately simplified; three grades, no sub-day scheduling)

On POST `/api/review` with `outcome`:
- `again` → `lapses+1`, `intervalDays = 0` (re-due in 10 minutes), `easeFactor -= 0.20`
  (floor 1.30);
- `good` → `intervalDays = max(1, round(intervalDays × easeFactor))`;
- `easy` → `intervalDays = max(2, round(intervalDays × easeFactor × 1.3))`,
  `easeFactor += 0.05`;
- cap `intervalDays` at 60; `reps+1`; `dueAt = now() + intervalDays` (or +10 min for `again`).
(`easeFactor` stored ×100 as an integer, §3.3.)

### 13.4 Review UX (`/review`)

≤10 due items per round. Default flow is **spoken** (retrieval + production in one, §11.1):
the app shows/speaks `front` → learner records their answer → sent through
`/api/lesson/attempt` with `mode: 'review'` and the expected `back` in `promptContext` →
Gemini judges the match → zero errors maps to a `good`/`easy` choice for the user, errors map
to `again` (with the normal feedback shown). A "type instead" fallback (text-only provider
call, §14) exists for quiet environments. Grades POST to `/api/review`; XP per §12.2.

---

## 14. LLM provider abstraction (v2)

Owner requirement: Google now, but swappable later. The abstraction is one thin interface —
**no framework, no plugin system.**

### 14.1 Interface (`src/lib/llm/provider.ts`)

```ts
export type FeedbackArgs = {
  systemPrompt: string;
  userTurnContext: string;
  input: { kind: 'audio'; base64: string; mimeType: string } | { kind: 'text'; text: string };
};

export interface LlmProvider {
  /** Returns the §4.1 feedback JSON (caller Zod-validates — never trust the provider). */
  getFeedback(args: FeedbackArgs): Promise<unknown>;
}

export function getProvider(): LlmProvider; // reads LLM_PROVIDER env, default 'gemini'
```

### 14.2 Rules

- The §4.1 feedback JSON shape is the **provider-neutral contract**; each adapter maps it to
  its native structured-output mechanism (Gemini: `responseSchema`; a future Claude adapter:
  tool-use/structured outputs). Zod validation stays in the route, once, provider-independent.
- `lib/llm/gemini.ts` is the ONLY consumer of `lib/gemini/*`; routes and components import
  only `lib/llm/provider.ts`.
- Audio-input capability differs across providers. If a future provider can't take audio
  directly, its adapter handles transcription internally (e.g. a separate STT step) — the
  app's calling code never changes.
- TTS is already isolated the same way in `lib/tts.ts` (§4.5) — swapping to e.g. ElevenLabs
  touches that one file.
- Prompt *assembly* (§4.1) stays outside the adapters — prompts are provider-agnostic text.

### 14.3 Enforcement

ESLint `no-restricted-imports`: importing `@google/genai` anywhere outside `src/lib/llm/**`,
`src/lib/gemini/**` and `src/lib/openai/**` fails the lint (added in Phase 4C, extended in
§14.4). `LLM_PROVIDER=gemini` documented in `.env.example`.

### 14.4 Admin-selectable provider + model (v5 — BUILT)

Owner requirement (August 2026): choose the model **per task, from the browser**, across both
Google and OpenAI, without a redeploy — and see what a switch costs before making it.

**Storage.** New `app_settings` table (key → JSONB value + `updatedAt`/`updatedByUserId`), one
row: `llm_models`. Shape (`llmSettingsSchema` in `zodSchemas.ts`):
`{ tasks: { lesson_feedback: {providerId, modelId}, live_conversation: {…} }, openaiTranscribeModelId }`.
Validated on **write and read** — the row is hand-editable in the database and a malformed one
must never reach a provider. Env vars (`LLM_PROVIDER`, `GEMINI_LESSON_MODEL`, `OPENAI_*`)
remain as the fallback used before anything is saved, so behavior with no row is exactly what
it was before this existed.

**Resolution.** `getProviderForTask(task)` in `lib/llm/provider.ts` returns `{ provider, model }`;
the route passes `model` in `FeedbackArgs` and adapters never choose their own. Settings are
cached in-process for 30 s (a stale model choice is a billing surprise, so the TTL stays short)
and the cache is invalidated on save.

**Model IDs are free text, deliberately.** `lib/llm/catalog.ts` lists what we know, but /admin
accepts any model ID for a provider, because provider model names churn faster than we redeploy
(§10.7). **Only verified prices appear in the catalog** — Gemini's, from §0. Unknown prices
render as "unknown, check the pricing page", never as a guess; the per-100-turns figure is a
stated estimate from `TURN_TOKEN_ESTIMATE`, not a billing figure.

**OpenAI adapter (`lib/llm/openai.ts` + `lib/openai/**`, plain `fetch`, no SDK).** The
capability gap §14.2 anticipated is real: OpenAI's chat models don't take the recording, so a
spoken turn is **transcribe → feedback**, two calls. Consequences, stated in the admin UI rather
than buried here: more latency, more cost, and **no pronunciation feedback** — a transcript
cannot carry it, so the prompt explicitly forbids guessing at it (the same call §4.4 made for
the true-Live transcript path). Gemini stays the right default for a *speaking* app; this exists
so the choice is the owner's and is reversible in one click.

**Test button.** `/api/admin/models/test` runs a text-only probe against the selected
provider+model and reports latency, whether the JSON passed the Zod contract, and a sample
reply. Text, not audio: cheap, fast, provider-independent — it proves the key and the model,
**not** that audio input works. Admin-only, logged to `usage_log` as `admin_model_test`.

---

## 15. Cost model for the three voice paths + tier gating (v4)

Replaces the v2/v3 hand-wave ("~$1–3/hour"). Re-verify prices at build time (§9 Q7) — they moved
twice in the first half of 2026.

### 15.1 The three paths

- **A — what ships today.** `generateContent` with inline audio → one structured JSON response →
  Cloud TTS synthesizes the reply → client plays it. Serial; nothing is heard until every step
  finishes.
- **B — A, parallelized (Phase 7B).** Same models, same calls, same tokens. Audio starts playing
  as soon as `tutorReply` exists; persistence moves off the response path. **Purely an
  engineering change — it buys latency for zero additional spend.**
- **C — Gemini Live API (§4.2).** True simultaneous voice-to-voice over a WebSocket, native audio
  in and out, no separate TTS step.

### 15.2 What they actually cost

Unit assumptions, stated so they can be argued with: a **turn** is ~15 s of learner speech;
audio bills at ~32 tokens/second; a per-turn request carries ~900 tokens of assembled system
prompt (template + dialect notes + correction style + coaching profile + ~20 taxonomy keys +
top-5 error patterns + lesson context) and returns ~350 tokens of structured JSON; the tutor's
spoken reply is ~200 characters. A **session** is 20 turns ≈ 12 minutes. Beta scale is 2 users ×
1 session/day ≈ **1,200 turns/month**.

| | Path A / B | Path C |
|---|---|---|
| Gemini, per turn | ~1,400 in @ $1.50/M + ~350 out @ $7.50/M ≈ **$0.0047** | n/a (billed by audio duration) |
| Cloud TTS, per turn | ~200 chars @ $16/M ≈ **$0.0032** | n/a (native audio out) |
| **Per turn, paid rates** | **≈ $0.008** | ≈ $0.008 equivalent |
| **Per hour of practice, paid rates** | **≈ $0.95** | input 115k tok/h @ $3/M + output ~46k tok/h @ $12/M ≈ **$0.90** |
| **Beta cost (2 users, 1 session/day)** | **$0/month** — 40 req/day vs the 1,500 RPD free cap; ~240k TTS chars/month vs the 1M free allotment | **≈ $11/month** |

**The headline finding: A/B and C cost roughly the same per hour at paid rates.** Real-time is
not intrinsically expensive. The entire practical difference is that A/B fit inside two free
allowances and C does not — Live audio has no meaningful free tier, and ephemeral tokens are
reported (unverified — Google's docs were unreachable at v4 authoring time; **the builder must
test this with an unbilled key before planning around it**) to require a billing-enabled
project. So the decision is not "cheap vs expensive", it is **"free vs ~$11/month"**, and it
should be made on whether Phase 7B's latency work is good enough, not on cost alone.

Two second-order costs C carries that the table doesn't show, and they are the real reason to
defer it: the Live API returns **plain transcripts, not structured errors**, so §4.4's post-hoc
analysis pass has to be built or the dashboard and the whole error-pattern loop go dark for live
practice — splitting the product in two (§10 item 4). And the original Vercel Hobby host could not
proxy a WebSocket,
so the browser must connect directly, which is what drags ephemeral tokens in at all.

**Free-tier headroom, for planning:** 1,500 requests/day ÷ 20 turns ≈ **75 sessions/day**, i.e.
roughly 35 daily-active users on path A (about 18 on B if it splits into two calls per turn).
The tighter ceiling is concurrency: 10–15 RPM shared across one key ≈ **6–8 people practicing at
the same moment**. Both are per *project*, not per user.

### 15.3 Tier gating — build the gate, not the commerce

The owner has floated free-tier A with a premium unlock for B/C. The gate is cheap and worth
having; the commerce around it is a different project.

**In scope now (one migration, ~30 lines):** a `users.tier` column (`'free' | 'premium'`,
default `'free'`) plus a server-side capability check in `/api/lesson/attempt` and any future
live-token route. The owner flips it by hand with one SQL statement. This gives per-user control
of expensive modes with no billing infrastructure, and it is the thing that must exist *first*
under any future model — including "the owner enables real-time for himself for a month to see
if it's worth it." Enforce it **server-side only**; a client-side flag is decoration.

**The $10 Google credit (v5) — what it does and doesn't buy.** It sits on the *billed* project
(B), never project A, whose free tier a billing link would permanently destroy (§0). Concretely
it is worth: ~1 month of true real-time Live mode at the §15.2 estimate of ~$11/month, **or**
~600k characters of Cloud TTS beyond the 1M/month free allotment, **or** ~2,000 paid-rate
feedback turns. The useful framing is that it makes *one* month-long experiment affordable —
e.g. turning on path C for the owner alone, behind the `users.tier` gate, to find out whether
real-time is worth paying for. It is not a reason to relax any cap in §6: when it runs out the
free-tier limits are the only thing standing between this app and a monthly bill, so they must
still be enforced while the credit is live. Keep the budget alerts at $2/$10 (Phase 0 step 4)
exactly as they are — they are what tells you the credit is gone.

**Explicitly out of scope, and each one is real work, not a checkbox:**

- ~~**Vercel Hobby forbids commercial use**~~ — **removed as a blocker by §6.13.** Under the old
  host, the moment money changed hands the project had to move to Pro (~$20/month), which by
  itself exceeded the entire cost model. Hostinger has no such clause, so this particular
  obstacle is simply gone; the others below are not.
- **The Gemini free tier's data caveat** (§0) makes project A unusable for third-party users'
  recordings. Paying customers means the paid tier, which means path A's true COGS is ~$0.008 per
  turn — about **$0.30 per user per month** at beta usage, before hosting, before TTS overage.
- **The shared free-tier ceiling** (above) is per project, not per user. Growth past a few dozen
  daily users forces the paid tier regardless of what anyone is charged.
- **Google OAuth is in "Testing" publishing status** with two hardcoded test users (Phase 0 step
  5). Public signup requires publishing and, for sensitive scopes, verification.
- **Billing, invoicing and Swedish/Paraguayan tax handling** are an entire separate build.

Nothing above says don't — it says the premium tier is a business decision with a floor of about
$20/month in fixed costs, and it should be made deliberately rather than arrived at by adding a
column. Until then: build the gate, keep both beta users on `premium`, and keep the app at $0.

---

## 16. Known defects in shipped code (found v4 by reading `main`)

Neither is hypothetical; both are in merged, code-complete phases. Fix both in the session after
Phase 0 live verification, when there is real data to verify against.

1. **`practice_sessions` rows are never closed.** `endedAt` is declared in the schema
   (`src/lib/db/schema.ts`), read by `getOrCreateSession` (`isNull(practiceSessions.endedAt)`)
   and surfaced by `lib/progress.ts` — but **nothing anywhere sets it**. Phase 3 specifies
   "ended on leave" and that was never built. Consequence: `getOrCreateSession` finds the same
   open row forever, so every turn a user ever records collapses into one endless "session".
   `SessionHistory` degenerates to a single row, and any future per-session metric (session
   length, turns per session, the Phase 8 weekly recap) is wrong from the first day of real use.
   **Fix:** close on explicit leave (a `sendBeacon` to a small `/api/session/end`, since
   `beforeunload` is unreliable on mobile) *and* defensively in `getOrCreateSession` — treat an
   open session whose latest utterance is older than ~30 minutes as ended, and start a new one.
   The defensive half matters more than the beacon: phones background tabs without warning.
2. **No monthly cap on TTS characters.** `lib/usage.ts` enforces only
   `DAILY_LESSON_ATTEMPT_CAP` on `lesson_attempt`. `tts_chars` is logged and never checked
   against the 1M/month free allotment. Cloud TTS lives in project B, **which has billing
   enabled** — so unlike Gemini's free tier, it fails *open* and silently starts charging
   ($16/1M chars) instead of returning 429. This is the one place where the "$0/month,
   confirmed" constraint is enforced by nothing but low usage. **Fix:** a
   `isUnderMonthlyTtsCharCap()` check summing `tts_chars` for the calendar month against a
   constant set to ~80% of the free allotment; over the cap, skip synthesis and return text-only
   feedback — the degradation path already exists and is already non-fatal (§4.5). Surface the
   running total on the admin usage page (§6.5).

---

*End of PLAN.md, v4. Builders: pick up at the next unblocked item in the §"what's needed to
finish" table, read §11–§16 first, and keep every acceptance check honest — they are tested on
the two real phones, not desktop. The single highest-value thing anyone can do for this project
right now is Phase 0, and it is not a coding task.*
