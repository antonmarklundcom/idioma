# Next session — build brief

Rewritten at the end of the 23 Aug 2026 session, for the session that picks this up.
Read this first, then `AGENTS.md`, `ROADMAP.md` and `PLAN.md` where it matters.

---

## Where the app stands

Merged to `main` last night: PRs #41–#50 (see the git log; the previous brief was #50).
Merged this session: **#51–#58**, which is the whole of the previous brief's build list.

- **#51** attempt 1 vs attempt 2 — the retry now shows "3 mistakes → 0" and the scorecard
  sums it up
- **#52** speaking minutes — `useRecorder` measures capture time, every record loop sends it,
  `usage_log` stores it as `speaking_seconds`, /dashboard shows "you spoke N minutes"
- **#53** shadowing — hear the word, say it back, hear both, inside the vocab step. No model
  call, no upload, no graded turn
- **#54** spoken placement — `/placement` runs 4–6 speaking tasks picked from stored lessons,
  suggests a level, the learner confirms. Offered at onboarding and from Settings
- **#55** your problem areas — `/review/problems` drills the learner's own recorded mistakes;
  mistakes with nothing to practise are logged as `content_gap:<patternKey>` and ranked in /admin
- **#56** the migration (`0008`) — `profile_notes`, `fact_learning`, `explanation_language`
- **#57** owner tools — `OWNER_EMAILS`, `INVITED_EMAILS`, and a People panel in /admin
- **#58** Swedish A2 rework for visitors — positions 16, 18 and 24 replaced

84 lessons across 3 pairs are in `content/lessons`. **They are not in the production
database** — they arrive there through /admin's import panel, not by deploying. Three of them
changed in #58 and need re-importing.

---

## Do this before writing code

1. **Run the migration.** #56 added `drizzle/0008`. `npm run build` runs `deploy-migrate`, so a
   normal deploy applies it; `npm run db:migrate` does it by hand.
2. **Set `OWNER_EMAILS`** in production. Until it is set, admin still depends on the `role`
   column — which is exactly the failure #57 exists to prevent.
3. **Re-import the lessons** through /admin, or positions 16/18/24 of the Swedish A2 deck stay
   the old resident-shaped ones.
4. **`INVITED_EMAILS` is optional.** Unset, anyone with a Google account can sign in, as before.

---

## Decisions already made — do not re-ask

1. **Azure pronunciation scoring: parked.** Revisit only if the owner raises it.
2. **The tutor remembers personal facts.** Three asked at onboarding, everything editable in
   Settings. Facts it learns on its own default **OFF** (owner's answer, this session).
3. **The parents are VISITING Paraguay, not moving.** Recorded in
   `content/curriculum/es-PY-sv-speaker.md` with the substitution table it implies. A2 is done;
   B1 for that pair inherits the same reasoning.
4. **Real-time live mode is premium**, and BYO Gemini key is the interesting path for it.
5. Merge on green: PR per chunk, merge when CI passes, never push to `main`.

---

## Build list, in order

### 1. Real-time premium mode (large — the last item off the previous brief)
Gemini Live is ~$1.40 per conversation-hour and has a rate-limited free tier. Gate on
`users.tier = 'premium'` (the mechanism exists). BYO Gemini key per user is what makes it
affordable for family; that key must be encrypted at rest and never returned to the client.
PLAN.md §4.2 has the design; ROADMAP.md P2.10 has the budget note.

### 2. The next content pack
Two candidates, owner's choice — the question was asked and not answered this session:
- **B1 for `en>es-speaker`** (the pair that stops at A2 today), or
- **B1 for `es-PY>sv-speaker`**, starting with `talking-about-sweden`, which #58 left unplaced.
Generated with Gemini using `content/prompts/curriculum-generation.md` (canDo, dialogue and
fill_gap_speak are all in the contract). Run `npm run lessons:qa <pack>` before importing.

### 3. Cost meter (ROADMAP.md P2.11, small)
/admin already has per-learner estimates from #57. This is the learner-facing half: a "what this
costs" card on /settings. Do it with or before the live mode.

### 4. Follow-ons the last session left behind
- Shadowing time is not counted as speaking time (#53): nothing reaches the server. Worth wiring
  up if the family shadows more than it drills.
- Placement turns synthesize a tutor reply nobody listens to (#54). A "no spoken reply needed"
  flag on the attempt route would save ~6 replies per learner.
- `/today` still skips the vocab and dialogue steps — it is time-boxed, and a step is not free
  there.
- Paraguayan TTS voice (ROADMAP.md P2.9), when the owner says go.

---

## Open questions for the owner

1. **Did `GOOGLE_TTS_API_KEY` get set in Vercel Production?** Still unanswered, and it still
   decides whether the tutor speaks at all — which now also decides whether shadowing (#53) does
   anything. SEPARATE Google Cloud project from the Gemini key, billing enabled, key restricted
   to Text-to-Speech (PLAN.md §4). Check the Vercel runtime log for a `[tts]` line.
2. **Which content pack next** (build list item 2)?
3. After a week of use: does the fact-learning switch (#56) want to default ON after all? The
   answer is one column default and one line in the schema comment.

---

## House rules for the work

- Branch per chunk, PR per chunk, merge on green. Never push to `main` directly.
- Before every push: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run lessons:validate`, `npm run lessons:qa`, `npx next build`.
- No migration unless the build list says so.
- `lessons:qa` exists because a bad lesson imports silently. Run it on any new pack
  before importing: `npm run lessons:qa path/to/pack.json`.
- The app never generates curriculum at request time (PLAN.md §0). Assembling drills from
  stored review items and error patterns is fine (#55); writing new lesson content is not.
- `content/samples/dialogue-demo.json` shows the current lesson format end to end.
