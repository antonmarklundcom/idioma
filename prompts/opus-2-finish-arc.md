# Phase p4-b — Finish arc + conquered celebrations. Paste into a fresh OPUS session, ONLY after phase p4-a is merged.

Read `AGENTS.md`, then `ROADMAP.md` §5 in full (plus §5.7 build log) and
`KNOWN-ISSUES.md` if it exists. Execute **ROADMAP §5.2 P4.3** under the autonomy
protocol §5.4. Build nothing outside it.

Phase rules:
- Branch `phase/p4-b` off latest `main`; previous phase unmerged ⇒ finish it first.
  Re-runnable: continue from the first unmet exit criterion.
- Read the bundled Next.js 16 docs in `node_modules/next/dist/docs/` first (AGENTS.md).
- "Conquered" stays a DERIVED state — the migration adds only
  `error_patterns.conquered_celebrated_at`; the upsert path nulls it on recurrence.
- The finish arc is a render-layer change: no new grading path, no new attempt route.
  Reuse `attemptComparison`, `Celebration`, `uiSounds`, and the existing finish screens
  in `TodayFlow`/`LessonPlayer`.
- Animations respect the ONE global `prefers-reduced-motion` rule in `globals.css`.
- Copy is warm, never guilt (PLAN.md §12.1.3) — especially the comeback card. All new
  strings in en/es/sv (`tests/i18n.test.ts`).

Exit criteria (all checkable):
- `npm run typecheck && npm run lint && npm test && npm run lessons:validate` green and
  `npx next build` succeeds.
- Finish screen shows XP count-up, quest ticks, words practiced + mistakes fixed, and one
  named tomorrow-hook; conquered flip celebrates exactly once per conquest (unit-test the
  flip/reset decision as a pure function); trophy case lists conquered patterns; shield
  message renders only in the week the shield triggered.
- ROADMAP P4.3 marked SHIPPED + §5.7 build-log entry, in this PR.
- PR merged to `main` (auto-merge armed at open, squash).

## After this phase — hand off, MODEL SWITCH (autonomy protocol §5.4.7)
Verify the merge through the `mcp__github__*` tools (PR `merged`, `origin/main` contains
the commit, checks green). Then spawn a NEW session via claude-code-remote
`create_session`: model `claude-sonnet-5` (never Fable), inherited environment/permissions
(never `plan`), prompt exactly:
`Read prompts/sonnet-3-progress-panel.md in this repo and execute it.`
If `create_session` is unavailable, STOP and report (this is a model switch — do not run
the Sonnet phase on Opus). If the merge cannot be verified, report the blocker instead.
