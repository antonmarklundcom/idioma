# Next session — build brief

Rewritten at the end of the 26 Aug 2026 session (the four-item follow-up), for the
session that picks this up. Read this first, then `AGENTS.md`, `ROADMAP.md` and
`PLAN.md` where it matters.

---

## Read this before you believe ROADMAP.md's P0 section

The 26 Aug session was briefed to implement **P0.3 (design system) and P0.4 (/today)**.
Both had already been merged on 22 Aug — `b3b75b7` and `fe3af13`, in the P0 workstream.
Nobody had marked them SHIPPED in ROADMAP.md the way P1.5 and P1.6 are marked, so the
roadmap still read as a to-do list for work that was live in the app.

That is now fixed: **P0.3 and P0.4 say SHIPPED, with what actually landed under each.**
The lesson for whoever writes the next brief — check `git log` against the roadmap item
before scheduling it, and mark items shipped in the same PR that ships them. This
session (the four-item follow-up below) re-verified every item it was briefed against
`git log` and the code before starting; none turned out to be already built.

---

## Where the app stands

Merged to `main`: PRs #41–#68 (the previous two briefs), plus **#69–#72** from this
26 Aug follow-up session (one PR per item, merged on green, in order):

- **#69 — Cost meter (ROADMAP.md P2.11, now SHIPPED).** A "what this costs" card on
  `/settings`: this signed-in learner's own `usage_log` activity for the current UTC
  month — attempts, TTS characters, speaking minutes — with a rough dollar estimate.
  `src/lib/costMeter.ts` reads the same rows and calls the same `estimateMonthlyUsd`
  helper `src/lib/adminLearners.ts` (#57) uses for the admin panel, scoped to one user,
  so the two views can never disagree on one person's number.
- **#70 — Jopará/culture layer (ROADMAP.md P1.8, now SHIPPED).** Data-only:
  `guarani-loanword` added to both Paraguayan-Spanish-target error taxonomies in
  `scripts/seedPairs.ts`, and both pairs' `dialectNotes` gained a B1+-gated paragraph
  letting the tutor weave in common jopará particles/loanwords (na, ko, piko, the
  Paraguayan "luego") with a gloss, opt-in, never graded as an error if absent. A1/A2
  behavior is untouched.
- **#71 — Placement stops synthesizing replies nobody hears.** `/placement` (#54) ran
  4–6 speaking tasks through the normal attempt route, which synthesized a spoken
  tutor reply per turn that `PlacementRun` never played. `lessonAttemptRequestSchema`
  gained a `noSpokenReply` flag (default `false`); `/api/lesson/attempt` skips the
  quick-reply call and TTS synthesis when it's set, with grading and persistence
  completely unchanged. `PlacementRun` sets it on every attempt.
- **#72 — Onboarding polish for parents (ROADMAP.md P3.13, now SHIPPED).**
  `/onboarding` preselects the sv-native pair from the browser's Accept-Language
  header (`src/lib/onboarding.ts`, pure and tested); `OnboardingForm`'s touch targets
  and text grew throughout, on the same design-system classes; a new
  `/onboarding/welcome` interstitial (three cards: warm-up, lesson, free chat) sits
  between onboarding and the first real screen.

84 lessons across 3 pairs are in `content/lessons`. **They are not in the production
database** — they arrive there through /admin's import panel, not by deploying. Three of
them changed in #58 and still need re-importing (carried over — unchanged this session).

---

## Do this before writing code

1. **Redeploy** if the deployed commit predates #72. No new migration since `0009`
   (`lesson_audio`); #69–#72 add none. Check the build log says
   `[migrate] applying pending migrations` or that there is nothing pending.
2. **Run `npm run audio:generate`** (needs `DATABASE_URL` + `GOOGLE_TTS_API_KEY` locally)
   if it has not been run since the last import. ~900 recordings, ~25k characters, once.
   Re-run it after every content import, or the app pays per tap for the new words.
   `/admin` shows the stored count.
3. **Import the lessons** through /admin: the three reworked Swedish A2 lessons (#58) and
   any new pack. NOTE: the importer INSERTS and rejects duplicate titles — it does not
   update. To replace a lesson, delete the old one in /admin first, or you get two at the
   same position.
4. **`OWNER_EMAILS`** should be set in Production; `INVITED_EMAILS` stays optional.

---

## Decisions already made — do not re-ask

1. **Azure pronunciation scoring: parked.** Revisit only if the owner raises it.
2. **The tutor remembers personal facts.** Three asked at onboarding, everything editable
   in Settings. Facts it learns on its own default **OFF**.
3. **The parents are VISITING Paraguay, not moving.** Recorded in
   `content/curriculum/es-PY-sv-speaker.md` with the substitution table it implies. A2 is
   done; B1 for that pair inherits the same reasoning.
4. **Real-time live mode is premium**, and BYO Gemini key is the interesting path for it.
5. Merge on green: PR per chunk, merge when CI passes, never push to `main`.
6. **The design language is settled** (#64 closed the last gap). New screens use `card`,
   `panel`, `btn-primary` / `btn-secondary`, `chip`, `field`, `option-card` and the
   surface/ink/line tokens. If a new shape gets typed out twice, it belongs in
   `globals.css`, not in a third component.
7. **Jopará is opt-in, B1+ only** (#70). Never require it from the learner, never grade
   its absence as an error, never surface it below B1.

---

## Build list, in order

### 0. Engagement & reward-loop overhaul (NEW, 1 Sep 2026 — outranks everything below)
The owner used the app and called it "average" — the reward loop is flat, not the
plumbing. Fable wrote the full plan as **ROADMAP.md §5** (P4.1–P4.4, P5.1–P5.2, an
autonomy protocol, and a phase table) with one executable prompt file per phase in
`prompts/`. Do NOT re-plan it here. To start:
- Owner: do the two one-time repo settings in ROADMAP §5.8.1 (allow auto-merge +
  required CI check on `main`), then paste into a fresh **Opus** session:
  `Read prompts/opus-1-reward-core.md in this repo and execute it.`
- Each phase merges its own PR on green and spawns the next phase itself
  (Opus → Opus → Sonnet → Sonnet, per ROADMAP §5.5). Progress lives in ROADMAP §5.7.
- P3.12 (family gamification, below) is superseded by ROADMAP §5.3 — don't build it
  from the old spec.

### 1. Real-time premium mode (large — carried over; now runs AFTER item 0)
Gemini Live is ~$1.40 per conversation-hour and has a rate-limited free tier. Gate on
`users.tier = 'premium'` (the mechanism exists). BYO Gemini key per user is what makes it
affordable for family; that key must be encrypted at rest and never returned to the client.
PLAN.md §4.2 has the design; ROADMAP.md P2.10 has the budget note. The cost meter (#69)
that was meant to ship alongside or before this is now done.

### 2. The next content pack
Two candidates, owner's choice — **the question has now been asked three times and not
answered**:
- **B1 for `en>es-speaker`** (the pair that stops at A2 today), or
- **B1 for `es-PY>sv-speaker`**, starting with `talking-about-sweden`, which #58 left unplaced.

Generated with Gemini using `content/prompts/curriculum-generation.md` (canDo, dialogue and
fill_gap_speak are all in the contract). Run `npm run lessons:qa <pack>` before importing.
If this B1 pack targets `es-PY>*`, remember the jopará dialect notes (#70) are already
live — no content changes needed for them to apply, they're prompt-time, not lesson-time.

### 3. Follow-ons still waiting
- **The lesson is silent between turns.** The tutor only speaks AFTER a graded answer, so
  the vocabulary step and the exercise prompts are read, never heard. The owner's words:
  "the app still doesn't speak with me and guide me during lesson so it is 100% quiet".
  Worth deciding whether the exercise prompt should be spoken — it is in the learner's OWN
  language, so this is a design question, not an oversight. **This is the most-complained-
  about thing in the app and nobody has decided it yet.**
- `/today` still skips the vocab and dialogue steps — it is time-boxed, and a step is not
  free there. Worth revisiting now that both steps have shipped.
- Paraguayan TTS voice (ROADMAP.md P2.9), when the owner says go.
- `public/icons/*` are still generated placeholders (`npm run icons`). They build and
  install fine; they just aren't a real icon. Cosmetic, and nobody's blocker.
- Family gamification (ROADMAP.md P3.12, medium) — the family strip, shared weekly goal,
  and streak-deadline push notification. Not started.

---

## Open questions for the owner

1. **Did `GOOGLE_TTS_API_KEY` get set in Vercel Production?** Asked in the last three
   briefs and still unanswered. It decides whether the tutor speaks at all — which decides
   whether shadowing does anything, and whether shadowing reports any speaking time (#66:
   with no audio the run refuses to start, by design). `/admin` → "The tutor's voice"
   answers this in one click, from the deployed app, without reading a log.
2. **Which content pack next** (build list item 2)?
3. **Should the exercise prompt be spoken?** (build list item 3, first bullet.)
4. After a week of use: does the fact-learning switch (#56) want to default ON after all?
   One column default and one line in the schema comment.
5. Does the Gemini project want its free tier back? As of 23 Aug the Gemini API runs on the
   PAID tier. Observed cost: 26 requests → kr0.44, so roughly kr 30/month for four people
   practising daily, against a 100 SEK credit. The upside of staying paid is no free-tier
   rate limits mid-lesson. Restoring it = a fresh AI Studio project with no billing + a new
   `GEMINI_API_KEY`. **TTS now lives in the same project as Gemini**
   (`gen-lang-client-0909313285`), with its own key restricted to Cloud Text-to-Speech —
   the separation PLAN.md describes is moot.

---

## House rules for the work

- Branch per chunk, PR per chunk, merge on green. Never push to `main` directly.
- Before every push: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run lessons:validate`, `npm run lessons:qa`, `npx next build`.
- **Mark the roadmap item SHIPPED in the PR that ships it.** See the note at the top of
  this file for what happens otherwise.
- No migration unless the build list says so.
- `lessons:qa` exists because a bad lesson imports silently. Run it on any new pack
  before importing: `npm run lessons:qa path/to/pack.json`.
- The app never generates curriculum at request time (PLAN.md §0). Assembling drills from
  stored review items and error patterns is fine (#55); writing new lesson content is not.
- `content/samples/dialogue-demo.json` shows the current lesson format end to end.
