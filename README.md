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

All phases through 7 (plus 5B, PWA, and the i18n dictionary) are **code complete and merged to
`main`**. Nothing has run against real credentials or a real database yet — **Phase 0 (the
owner's manual Google/Neon/Hostinger accounts-and-keys checklist, PLAN.md §8) is still not done**
and is the sole remaining blocker to live verification.

| Phase | State |
|---|---|
| 0 — Accounts & keys + Hostinger deploy (owner, manual) | ⏳ owner checklist in PLAN.md §8, Phase 0 — not started; **blocks live verification of everything below** |
| 1 — Scaffold + database | ✅ merged |
| 2 — Auth + onboarding | ✅ merged, code complete, untested live (needs Phase 0 credentials) |
| 3 — Lesson mode core loop | ✅ merged, code complete, untested live |
| 4 — Error aggregation + dashboard | ✅ merged, code complete, untested live |
| 4B — Gamification core | ✅ merged, code complete, untested live |
| 4C — Provider-abstraction audit | ✅ merged and verified (ESLint rule tested directly, no live creds needed) |
| 5 — Curriculum delivery + admin import | ✅ merged, code complete, untested live (still needs one owner-validated A1 content batch, §9 Q5, to have real lessons to browse) |
| 5B — SRS review queue + listening | ✅ merged, code complete, untested live |
| 6 — PWA (manifest, icons, Serwist service worker) | ✅ merged, code complete, untested live |
| 7 — Live conversation (turn-based) | ✅ merged, code complete, untested live |
| 8 — Polish + beta hardening | ✅ merged (error boundaries, loading/empty states, weekly recap, mobile pass, this README) — **the Phase 8 acceptance check itself ("both users use the app for a full week") is still blocked by Phase 0** and has not been run |

"Code complete, untested live" means: builds, type-checks, and lints clean, and was written
against the documented API/DB behavior, but has never executed against a real Gemini key, TTS
key, or Neon database. Expect real fallout on first live use — budget time for it, per PLAN.md's
own gap analysis.

## Runbook

### Local dev

```bash
npm install
cp .env.example .env.local   # fill in real values — see "Owner setup" below
npm run db:migrate           # apply migrations to Neon
npm run db:seed              # language pairs + demo lessons from content/lessons/
npm run dev
```

Run migrations and seeds **from your own machine**, never from Hostinger SSH — the shared server
cannot route IPv6 to Neon (PLAN.md §3.1, §6.13).

### Owner setup (Phase 0, one-time, manual — PLAN.md §8)

No code is written for this phase; it's owner-run account setup. Summary (full checklist in
PLAN.md §8 Phase 0):

1. **Hostinger**: hPanel → Websites → Add Website → Node.js Apps → Import Git Repository →
   `antonmarklundcom/idioma`, branch `main`.
2. **Neon**: create a project, copy the pooled connection string → `DATABASE_URL`.
3. **Google project A** ("idioma-free", AI Studio) → `GEMINI_API_KEY`. **Never link a billing
   account to this project** — that permanently kills its Gemini free tier.
4. **Google project B** ("idioma-cloud") → billing enabled (required even for the free Cloud TTS
   allotment) + budget alerts → `GOOGLE_TTS_API_KEY`.
5. **Google OAuth** consent screen (Testing, every beta tester added as a test user) + Web
   application client → `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
6. `AUTH_SECRET` via `npx auth secret`.
7. All values into **hPanel → the app → Environment Variables** *and* local `.env.local`.
   **Redeploy after any env change** (§6.14) — restarting the app is not enough, and a stale
   value fails as an opaque blank `Digest: …` error page.
8. Run `npm run db:migrate` and `npm run db:seed` from your own machine (never Hostinger SSH).

### Deploy

Deployment is Hostinger's GitHub integration, building from `main` (`npm run build` /
`npm start`, auto-detected). Push to `main` → Hostinger builds and deploys. Env var changes need
an explicit **redeploy** in hPanel, not just a restart (PLAN.md §6.14).

### Promote a user to admin

After signing in once (so the `users` row exists), run:

```sql
UPDATE users SET role = 'admin' WHERE email = '<owner email>';
```

Admins get `/admin` (usage/quota dashboard, model/provider switcher) and `/admin/content`
(curriculum import).

### Import content

All curriculum is authored by the owner (optionally with Gemini's help via
`content/prompts/curriculum-generation.md`) and imported — the app never generates lesson content
itself. As admin, go to `/admin/content` and paste/upload a JSON array of lessons matching the
shape in PLAN.md §3.4 (Zod-validated on the way in). The two files in
`content/lessons/*.sample.json` are placeholder demo lessons (A1 greetings, one per direction)
showing that shape, including a `listen_prompt` exercise whose `audioText` is synthesized and
played but never displayed to the learner.

### Review queue

Completing a lesson enqueues its `vocab` for spaced repetition, and every recurring mistake the
tutor records enqueues (or re-activates) a drill of its own — see `src/lib/srs.ts` for the
SM-2-lite scheduler (PLAN.md §13.3). `/review` runs a round of up to 10 due items by voice, with
a typed fallback for quiet places.

## Android TWA: deferred, not built

PLAN.md §7.3 documents wrapping the PWA in an Android TWA (Trusted Web Activity) via Bubblewrap
for a Google Play listing. **This is explicitly out of scope for the beta and has not been
started** — the beta ships as an installable PWA only (Phase 6). Nothing about the current build
blocks doing this later: the manifest, service worker, HTTPS, and installability the TWA needs
already exist. Revisit only if the owner decides a Play Store listing is wanted; see PLAN.md
§7.3 for the (unstarted) steps.
