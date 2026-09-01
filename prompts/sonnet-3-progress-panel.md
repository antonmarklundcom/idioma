# Phase p4-c — "Your Spanish is growing" panel. Paste into a fresh SONNET session, ONLY after phase p4-b is merged.

Read `AGENTS.md`, then `ROADMAP.md` §5 in full (plus §5.7 build log) and
`KNOWN-ISSUES.md` if it exists. Execute **ROADMAP §5.2 P4.4** under the autonomy
protocol §5.4. Build nothing outside it.

HARD LIMITS (Sonnet phase): no schema changes, no migration, no changes to the grading
pipeline, auth, or `lib/gamification.ts` beyond exporting existing timezone helpers.
Read-time queries only. A needed foundation change goes to `KNOWN-ISSUES.md` +
ROADMAP §5.6 backlog with a workaround, never into this PR.

Phase rules:
- Branch `phase/p4-c` off latest `main`; previous phase unmerged ⇒ finish it first.
  Re-runnable: continue from the first unmet exit criterion.
- Read the bundled Next.js 16 docs in `node_modules/next/dist/docs/` first (AGENTS.md).
- Data sources exactly as ROADMAP §5.2 P4.4 names them (`review_items`,
  `speaking_seconds` usage rows, completed lessons, conquered count, utterances by local
  day). Batch them in one `Promise.all`.
- Sparkline is plain inline SVG on the design tokens (no chart library), correct in dark
  mode. Panel uses `card`/`chip`/token classes; empty state via the shared `EmptyState`.
- All new strings in en/es/sv (`tests/i18n.test.ts`).

Exit criteria (all checkable):
- `npm run typecheck && npm run lint && npm test && npm run lessons:validate` green and
  `npx next build` succeeds.
- Dashboard shows the evidence panel (words known, speaking time total + this week, path
  % per level, conquered count, 8-week sparkline, level ring) and a brand-new user gets a
  sane empty state, not zeros soup.
- ROADMAP P4.4 marked SHIPPED + §5.7 build-log entry, in this PR.
- PR merged to `main` (auto-merge armed at open, squash).

## After this phase — hand off (autonomy protocol §5.4.7)
Verify the merge through the `mcp__github__*` tools (PR `merged`, `origin/main` contains
the commit, checks green). Then spawn a NEW session via claude-code-remote
`create_session`: model `claude-sonnet-5` (never Fable), inherited environment/permissions
(never `plan`), prompt exactly:
`Read prompts/sonnet-4-family.md in this repo and execute it.`
If `create_session` is unavailable, continue in this window (same model). If the merge
cannot be verified, report the blocker — do not spawn the next phase.
