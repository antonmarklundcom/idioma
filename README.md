# Idioma

A language-learning PWA for two beta users: an English speaker learning Paraguayan Spanish
(voseo, local vocabulary), and a Paraguayan Spanish speaker learning English. Spoken practice
against a Gemini-powered tutor, evidence-based coaching, spaced repetition, and lightweight
gamification. $0/month infrastructure (Vercel Hobby + Neon free tier + Google free quotas).

## Read PLAN.md first

**[PLAN.md](./PLAN.md) is the single source of truth.** It is a self-contained build spec
written so a fresh Claude session (Sonnet 5 / Opus 4.8) can execute any phase with no other
context. Read the whole thing — especially §11–§14 (learning science, gamification, spaced
repetition, LLM-provider abstraction) — before writing code.

## Status

| Phase | State |
|---|---|
| 0 — Accounts & keys (owner, manual) | ⏳ owner checklist in PLAN.md §8 — not started |
| 1 — Scaffold + database | ✅ merged |
| 2 — Auth + onboarding | ✅ code complete, untested (needs Phase 0 credentials) |
| 3 — Lesson mode core loop | ✅ code complete, untested (needs Phase 0 credentials) |
| 4 — Error aggregation + dashboard | ✅ code complete, untested (needs Phase 0 credentials) |
| 4B — Gamification core | ✅ code complete, untested (needs Phase 0 credentials) |
| 4C — Provider-abstraction audit | ✅ done and verified (ESLint rule tested directly) |
| 5 — Curriculum delivery + admin import | blocked on real lesson material (§9 Q5) |
| 5B — SRS review queue + listening | — |
| 6 — PWA | — |
| 7 — Live conversation (turn-based) | — |
| 8 — Polish + beta hardening | — |

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in real values (PLAN.md Phase 0)
npx drizzle-kit migrate      # apply migrations to Neon
npm run db:seed              # language pairs + demo lessons from content/lessons/
npm run dev
```

## Promote a user to admin

After signing in once (so the `users` row exists), run:

```sql
UPDATE users SET role = 'admin' WHERE email = '<owner email>';
```

## Content

All curriculum is authored by the owner (with Gemini) and imported — the app never generates
lesson content. The two files in `content/lessons/*.sample.json` are placeholder demo lessons
(A1 greetings, one per direction) showing the required JSON shape (PLAN.md §3.4).
