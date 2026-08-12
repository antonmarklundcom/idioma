# Idioma

A language-learning PWA for two beta users: an English speaker learning Paraguayan Spanish
(voseo, local vocabulary), and a Paraguayan Spanish speaker learning English. Spoken practice
against a Gemini-powered tutor, evidence-based coaching, spaced repetition, and lightweight
gamification. $0/month marginal infrastructure (a Hostinger Node.js slot on an already-paid plan
+ Neon free tier + Google free quotas).

> **Before touching `src/lib/db/index.ts`:** this app queries Neon over HTTPS
> (`drizzle-orm/neon-http`). Do **not** swap in a TCP Postgres driver — Hostinger cannot route
> IPv6 to Neon and every query will hang. See PLAN.md §3.1 and §6.13.

## Read PLAN.md first

**[PLAN.md](./PLAN.md) is the single source of truth.** It is a self-contained build spec
written so a fresh Claude session (Sonnet 5 / Opus 5) can execute any phase with no other
context. Read the whole thing — especially §11–§16 (learning science, gamification, spaced
repetition, LLM-provider abstraction, cost model, known defects) — before writing code.

## Status

| Phase | State |
|---|---|
| 0 — Accounts & keys + Hostinger deploy (owner, manual) | ⏳ owner checklist in PLAN.md §8 — not started; **blocks everything below** |
| 1 — Scaffold + database | ✅ merged |
| 2 — Auth + onboarding | ✅ code complete, untested (needs Phase 0 credentials) |
| 3 — Lesson mode core loop | ✅ code complete, untested (needs Phase 0 credentials) |
| 4 — Error aggregation + dashboard | ✅ code complete, untested (needs Phase 0 credentials) |
| 4B — Gamification core | ✅ code complete, untested (needs Phase 0 credentials) |
| 4C — Provider-abstraction audit | ✅ done and verified (ESLint rule tested directly) |
| 5 — Curriculum delivery + admin import | blocked on real lesson material (§9 Q5) |
| 5B — SRS review queue + listening | blocked on Phase 5 |
| 6 — PWA | blocked on an app icon image from the owner |
| 7 — Live conversation (turn-based) | ✅ code complete, untested (needs Phase 0 credentials) |
| 8 — Polish + beta hardening | needs all of the above |

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in real values (PLAN.md Phase 0)
npx drizzle-kit migrate      # apply migrations to Neon
npm run db:seed              # language pairs + demo lessons from content/lessons/
npm run dev
```

Run migrations and seeds **from your own machine**, never from Hostinger SSH — the shared server
cannot route IPv6 to Neon (PLAN.md §6.13). Deployment is Hostinger's GitHub integration from
`main`; env vars live in hPanel and need a **redeploy**, not a restart, to take effect.

## Promote a user to admin

After signing in once (so the `users` row exists), run:

```sql
UPDATE users SET role = 'admin' WHERE email = '<owner email>';
```

## Content

All curriculum is authored by the owner (with Gemini) and imported — the app never generates
lesson content. The two files in `content/lessons/*.sample.json` are placeholder demo lessons
(A1 greetings, one per direction) showing the required JSON shape (PLAN.md §3.4).
