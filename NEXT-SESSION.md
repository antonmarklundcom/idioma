# Next session — build brief

Written at the end of the 22 Aug 2026 session, for the session that picks this up.
Read this first, then `AGENTS.md`, `ROADMAP.md` (P1.5b) and `PLAN.md` where it matters.

---

## Where the app stands

Merged to `main` in the last session: PRs #41–#49.

- **#41** vocab step (tap a word to hear it) + mastery states (untouched / started /
  completed / mastered) + `fill_gap_speak`
- **#42** the in-lesson loop: "say it again" retry, the learner's own sentence marked up
  where they got it wrong, end-of-lesson scorecard, hear-yourself playback, next-lesson chaining
- **#43** the `dialogue` block (listen whole, then perform one side) + `canDo`
- **#44** the generation prompt pack updated to the current lesson format
- **#45** 24 new lessons (`es-PY>sv-speaker` A2, `es-PY>en-speaker` B1) + `npm run lessons:qa`, in CI
- **#46** a link out of /admin
- **#47** `focus_skills` reaches the tutor (it was collected and read by nothing)
- **#48** hands-free says when it paused because nobody spoke, and closes the session
- **#49** Admin moved from the header into Settings → Owner tools

84 lessons across 3 pairs are in `content/lessons`. **They are not in the production
database** — they arrive there through /admin's import panel, not by deploying.

---

## Decisions already made — do not re-ask

1. **Azure pronunciation scoring: parked.** Not now. Revisit only if the owner raises it.
2. **The tutor should remember personal facts**, learn more from conversation, and the
   learner can toggle that off and on in Settings.
3. **The parents are VISITING Paraguay, not moving.** Content for `es-PY>sv-speaker`
   should lean social / food / travel / health, not renting a flat and tenant disputes.
4. **Real-time live mode is premium**, and BYO Gemini key is the interesting path for it
   (a family member's own AI Studio key runs against their own free tier).
5. Merge on green: PR per chunk, merge when CI passes, don't batch everything into one branch.

---

## Build list, in order

### 1. Attempt 1 vs attempt 2 (small, no migration)
The retry from #42 replaces the first result with the second. Keep both and show the
improvement: "3 mistakes → 0". Client state in `LessonPlayer` only.

### 2. Speaking minutes (small, no migration)
Nothing tracks how long anyone actually speaks — the metric that correlates with fluency.
`useRecorder` already knows `elapsedSeconds`; send it with the attempt and log it to
`usage_log` as `kind: 'speaking_seconds'` (that table is `(kind, amount)`, so no migration).
Surface "you spoke N minutes this week" on /insights.

### 3. Shadowing mode (medium, no migration, no LLM cost)
Play a native line → learner repeats → hear both back. No grading, no model call; TTS is
already cached. Default placement: a "shadow these words" run inside the lesson's vocab
step, walking the vocab list. Uses the existing audio route.

### 4. Spoken placement test (medium, no migration)
Onboarding asks people to self-select A1/A2/B1, which nobody can do about themselves.
Four to six spoken tasks of rising difficulty through the existing attempt pipeline, then
the app **suggests** a level and the learner confirms. Writes `users.level`, which exists.

### 5. Lessons from your own mistakes (medium, no migration) + gap feedback
Assemble a drill from what is already stored — `error_patterns` and the learner's due
`review_items` — presented as "your problem areas". **PLAN.md §0 forbids the app writing
lesson content at request time**; this must PICK from stored material, never generate.

Owner also asked: collect feedback when there is no matching lesson for a recurring
mistake. Log it to `usage_log` as `kind: 'content_gap:<patternKey>'` (no migration) and
show the top gaps in /admin, so the next curriculum pack is written against real demand.
Both automatic detection and a learner-triggered "I want practice on this".

### 6. One migration, two features
- `users.profile_notes` (jsonb): facts the tutor knows about the learner. Three optional
  questions at onboarding (job, city, one thing they care about), editable and deletable in
  Settings, plus facts learned from conversation. A Settings toggle controls the learning.
  Feed into `assembleSystemPrompt` the same way `focus_skills` now is (#47).
- `users.explanation_language`: "explain corrections in…" → my language (default) / the
  language I am learning / both. Today the explanation language is fixed by the language
  pair and cannot be changed without changing the pair.

### 7. Owner tools (medium)
- Owner email in an env var so admin can never be lost if a `role` row changes.
- An invite list, so people are not just "whoever signed in".
- A per-learner card: streak, lessons done, mistakes-per-turn trend, what they cost.
Today the only way to see who exists is SQL in the Neon console.

### 8. Swedish A2 rework for visitors (content)
Positions 18 (renting an apartment) and 16 (home repairs) are dead weight for visitors —
and 24 (returning faulty goods) is marginal. Replace with visitor-shaped topics: being a
houseguest, day trips and excursions, buying gifts, talking about Sweden. Then update
`content/curriculum/es-PY-sv-speaker.md` to record that this pair now deliberately
diverges from the English map, and why (its learners are visitors, not residents).

### 9. Real-time premium mode (large — only after the above)
Gemini Live is ~$1.40 per conversation-hour and has a rate-limited free tier. Gate on
`users.tier = 'premium'` (the mechanism exists). BYO Gemini key per user is what makes it
affordable for family; that key must be encrypted at rest and never returned to the client.

---

## Open questions for the owner

1. **Did `GOOGLE_TTS_API_KEY` get set in Vercel Production?** Until it is, the tutor is
   text-only and hands-free has nothing to wait for. It is a SEPARATE Google Cloud project
   from the Gemini key — billing enabled, key restricted to the Text-to-Speech API — because
   linking billing to the Gemini project kills its free tier (PLAN.md §4). Check the Vercel
   runtime log for a `[tts]` line if it still does not speak.
2. **Have the 24 new lessons been imported through /admin?** They are in the repo and will
   not appear in the app until imported.
3. Which facts should the tutor ask for at onboarding, and should the *learned* facts
   default ON or OFF? (Asked facts default ON is assumed.)
4. Build the owner/invite/usage view now, or after the learner-facing items?
5. More content after the Swedish rework — B1 for `en>es-speaker`, or A2 for the Swedish
   pair's next level? Generated with Gemini using `content/prompts/curriculum-generation.md`
   (now includes `canDo`, `dialogue`, `fill_gap_speak`).

---

## House rules for the work

- Branch per chunk, PR per chunk, merge on green. Never push to `main` directly.
- Before every push: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run lessons:validate`, `npm run lessons:qa`, `npx next build`.
- No migration unless the build list says so. Items 1–5 need none.
- `lessons:qa` exists because a bad lesson imports silently. Run it on any new pack
  before importing: `npm run lessons:qa path/to/pack.json`.
- The app never generates curriculum at request time (PLAN.md §0). Assembling drills from
  stored review items and error patterns is fine; writing new lesson content is not.
- `content/samples/dialogue-demo.json` shows the current lesson format end to end.
