# Phase p4-a — Levels + daily quests. Paste into a fresh OPUS session.

Read `AGENTS.md`, then `ROADMAP.md` §5 in full (plus §5.7 build log) and
`KNOWN-ISSUES.md` if it exists. Execute **ROADMAP §5.2 P4.1 and P4.2** under the
autonomy protocol §5.4. Build nothing outside those two items.

Phase rules:
- Branch `phase/p4-a` off latest `main`. Re-runnable: if the branch exists, continue
  from the first unmet exit criterion.
- Read the bundled Next.js 16 docs in `node_modules/next/dist/docs/` before touching
  framework code (AGENTS.md — this Next.js differs from your training data).
- All XP/level/quest values live in the `GAMIFICATION` constants object
  (`src/lib/gamification.ts`) or a sibling in `lib/quests.ts` — never inline.
- Quest determinism and level math are PURE functions with unit tests in `tests/`
  (follow `tests/gamification.test.ts` style, node:test).
- One drizzle-generated migration for `user_stats.quests_state` (jsonb). Nothing else
  touches the schema.
- UI uses the settled design system only: `card`, `chip`, `btn-*`, surface/ink/line
  tokens. New strings in ALL of en/es/sv (`tests/i18n.test.ts` enforces parity).
- Do not degrade `/api/lesson/attempt` latency: awards ride the existing
  `after()`/response patterns already in that route.

Exit criteria (all checkable):
- `npm run typecheck && npm run lint && npm test && npm run lessons:validate` green and
  `npx next build` succeeds.
- Level badge renders in the app shell; level-up celebrates once; quest card on `/today`
  shows 3 deterministic quests with live progress; quest XP cannot double-award.
- ROADMAP P4.1/P4.2 marked SHIPPED + §5.7 build-log entry, in this PR.
- PR merged to `main` (auto-merge armed at open, squash).

## After this phase — hand off (autonomy protocol §5.4.7)
Verify the merge through the `mcp__github__*` tools (PR `merged`, `origin/main` contains
the commit, checks green) — never curl/gh. Then spawn a NEW session via claude-code-remote
`create_session`: model `claude-opus-5` (never Fable), inherited environment/permissions
(never `plan`), prompt exactly:
`Read prompts/opus-2-finish-arc.md in this repo and execute it.`
If `create_session` is unavailable, continue in this window (same model). If the merge
cannot be verified, report the blocker — do not spawn the next phase.
