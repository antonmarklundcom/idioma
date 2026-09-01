# Phase p5-a — Family strip + push reminder. Paste into a fresh SONNET session, ONLY after phase p4-c is merged. FINAL PHASE.

Read `AGENTS.md`, then `ROADMAP.md` §5 in full (plus §5.7 build log) and
`KNOWN-ISSUES.md` if it exists. Execute **ROADMAP §5.3 P5.1 and P5.2** under the
autonomy protocol §5.4. Build nothing outside them.

HARD LIMITS (Sonnet phase): the ONLY schema change is the `push_subscriptions` table
exactly as ROADMAP §5.3 P5.2 specifies (one drizzle-generated migration). No changes to
grading, auth, or streak/XP logic. Anything bigger → `KNOWN-ISSUES.md` + backlog note.

Phase rules:
- Branch `phase/p5-a` off latest `main`; previous phase unmerged ⇒ finish it first.
  Re-runnable: continue from the first unmet exit criterion.
- Read the bundled Next.js 16 docs AND the Serwist setup (`src/sw.ts`,
  `serwist.config.mjs`, PLAN.md §7.2 for what the SW must NOT do) before touching push.
- P5.1 removes the `SHOW_PARTNER_STREAK` flag and `getPartnerStreak` path entirely.
- Push is invisible without VAPID env (toggle hidden, scheduler idles) — missing keys are
  NEVER a blocker (`.env.example` documents them). The "who is due now" selector is a
  pure, unit-tested function (timezone, goal-unmet, streak ≥ 3, one-per-day dedupe).
- Notification copy is warm and specific, never guilt (PLAN.md §12.1.3). All new strings
  in en/es/sv (`tests/i18n.test.ts`).

Exit criteria (all checkable):
- `npm run typecheck && npm run lint && npm test && npm run lessons:validate` green,
  `npx next build` succeeds (including the SW build).
- Family strip renders for 1–10 users; weekly family goal bar resets on the ISO week;
  due-selector tests cover the timezone and dedupe cases; a 410 from the push service
  deletes the subscription row (tested at the pure-logic level).
- ROADMAP P5.1/P5.2 marked SHIPPED + §5.7 build-log entry, in this PR.
- PR merged to `main` (auto-merge armed at open, squash).

## After this phase — STOP. Closing report (no further sessions)
Verify the merge through the `mcp__github__*` tools, then END with a report for the
owner: what shipped across p4-a…p5-a (with PR links), the migrations to run on deploy
(`npm run db:migrate` fires in the build), the VAPID key setup steps (ROADMAP §5.8.4),
what's parked in §5.6 awaiting owner calls, and any KNOWN-ISSUES entries. Do NOT start
backlog items or P2.10. Do not spawn any session.
