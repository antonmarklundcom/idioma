# Next session — build brief

Rewritten at the end of the 26 Aug 2026 session, for the session that picks this up.
Read this first, then `AGENTS.md`, `ROADMAP.md` and `PLAN.md` where it matters.

---

## Read this before you believe ROADMAP.md's P0 section

The 26 Aug session was briefed to implement **P0.3 (design system) and P0.4 (/today)**.
Both had already been merged on 22 Aug — `b3b75b7` and `fe3af13`, in the P0 workstream.
Nobody had marked them SHIPPED in ROADMAP.md the way P1.5 and P1.6 are marked, so the
roadmap still read as a to-do list for work that was live in the app.

That is now fixed: **P0.3 and P0.4 say SHIPPED, with what actually landed under each.**
The lesson for whoever writes the next brief — check `git log` against the roadmap item
before scheduling it, and mark items shipped in the same PR that ships them.

The 26 Aug session spent its time on the gaps that audit turned up instead. See below.

---

## Where the app stands

Merged to `main`: PRs #41–#63 (the previous brief), plus **#64–#66** from 26 Aug.

- **#64** `/admin` was the one screen P0.3's design pass never touched — slate borders,
  `bg-white` cards, three separately hand-rolled button styles. It is on the tokens now.
  Three shapes the app kept re-typing were promoted into `globals.css`: `field` (6 copies),
  `option-card` (7 copies — the tappable row wrapping a radio, which is what makes the
  settings and onboarding forms usable on a phone) and `panel`. Settings, onboarding and
  the review typed-answer box were switched over in the same pass, so `/admin` adopting
  the design system did not leave two vocabularies behind.
- **#65** `/today` had no tab. P0.4 made it the post-login landing hours after P0.3 built
  the bottom tab bar, so tapping Lessons once lost the guided session — it was reachable
  only via the big button halfway down `/dashboard`, and no tab showed as current while
  you were on it. Today is now the first tab (🎯); the dashboard moved to the header's
  icon row next to the gear. Same PR: the "about 7 minutes" line was printed by the page
  shell over *everything* the flow rendered, including the finish screen, so somebody who
  had just finished was told the session would take about seven minutes. It now shows on
  the first step only.
- **#66** shadowing counts as speaking time. #53 built it to upload nothing, which
  included the seconds; `useRecorder` had been measuring them since #52 and `ShadowRun`
  was discarding the argument. `POST /api/speaking-time` writes one `speaking_seconds`
  row per run and **deliberately nothing else** — no XP, no streak, no graded turn, because
  shadowing is worth repeating twenty times precisely because it is free.

84 lessons across 3 pairs are in `content/lessons`. **They are not in the production
database** — they arrive there through /admin's import panel, not by deploying. Three of
them changed in #58 and still need re-importing.

---

## Do this before writing code

1. **Redeploy** if the deployed commit predates #66. No new migration since `0009`
   (`lesson_audio`); #64–#66 add none. Check the build log says
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

---

## Build list, in order

### 1. Real-time premium mode (large — carried over, still the biggest item)
Gemini Live is ~$1.40 per conversation-hour and has a rate-limited free tier. Gate on
`users.tier = 'premium'` (the mechanism exists). BYO Gemini key per user is what makes it
affordable for family; that key must be encrypted at rest and never returned to the client.
PLAN.md §4.2 has the design; ROADMAP.md P2.10 has the budget note.

### 2. The next content pack
Two candidates, owner's choice — **the question has now been asked twice and not answered**:
- **B1 for `en>es-speaker`** (the pair that stops at A2 today), or
- **B1 for `es-PY>sv-speaker`**, starting with `talking-about-sweden`, which #58 left unplaced.

Generated with Gemini using `content/prompts/curriculum-generation.md` (canDo, dialogue and
fill_gap_speak are all in the contract). Run `npm run lessons:qa <pack>` before importing.

### 3. Cost meter (ROADMAP.md P2.11, small)
/admin already has per-learner estimates from #57. This is the learner-facing half: a "what
this costs" card on /settings. Do it with or before the live mode.

### 4. Follow-ons still waiting
- **The lesson is silent between turns.** The tutor only speaks AFTER a graded answer, so
  the vocabulary step and the exercise prompts are read, never heard. The owner's words:
  "the app still doesn't speak with me and guide me during lesson so it is 100% quiet".
  Worth deciding whether the exercise prompt should be spoken — it is in the learner's OWN
  language, so this is a design question, not an oversight. **This is the most-complained-
  about thing in the app and nobody has decided it yet.**
- Placement turns synthesize a tutor reply nobody listens to (#54). A "no spoken reply
  needed" flag on the attempt route would save ~6 replies per learner.
- `/today` still skips the vocab and dialogue steps — it is time-boxed, and a step is not
  free there. Worth revisiting now that both steps have shipped.
- Paraguayan TTS voice (ROADMAP.md P2.9), when the owner says go.
- `public/icons/*` are still generated placeholders (`npm run icons`). They build and
  install fine; they just aren't a real icon. Cosmetic, and nobody's blocker.

---

## Open questions for the owner

1. **Did `GOOGLE_TTS_API_KEY` get set in Vercel Production?** Asked in the last two briefs
   and still unanswered. It decides whether the tutor speaks at all — which decides whether
   shadowing does anything, and now whether shadowing reports any speaking time (#66:
   with no audio the run refuses to start, by design). `/admin` → "The tutor's voice"
   answers this in one click, from the deployed app, without reading a log.
2. **Which content pack next** (build list item 2)?
3. **Should the exercise prompt be spoken?** (build list item 4, first bullet.)
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
