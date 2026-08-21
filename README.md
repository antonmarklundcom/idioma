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

The offline half of that verification now runs on every push (see "Checks" below): the
scheduling, streak, cap, tier and request-validation logic is covered by unit tests, so live
verification can spend its time on the things that genuinely need a phone and a key.

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

Admins get `/admin` — usage/quota dashboard, model/provider switcher, and curriculum import,
all on the one page.

### Enable an expensive practice mode for one user (tier gate, PLAN.md §15.3)

`users.tier` (`'free' | 'premium'`, default `'free'`) gates expensive practice modes
**server-side only** — there is no billing, no checkout, and no client-visible flag. Live
conversation requires `'premium'`; lessons and reviews never do. Both beta users belong on
`'premium'`: set `PREMIUM_USER_EMAILS` (comma-separated) and re-run `npm run db:seed` after they
have each signed in once, or do it by hand:

```sql
UPDATE users SET tier = 'premium' WHERE email = '<beta user email>';
```

A tier change takes effect on the user's next request — Auth.js uses database sessions here, so
the users row is re-read on every call; no sign-out, no redeploy.

### Import content

All curriculum is authored by the owner (optionally with Gemini's help via
`content/prompts/curriculum-generation.md`) and imported — the app never generates lesson content
itself. As admin, go to `/admin` and paste/upload a JSON array of lessons matching the
shape in PLAN.md §3.4 (Zod-validated on the way in).

`content/lessons/*.json` holds the real content — 60 lessons, no placeholders left:

| File prefix | Pair | Levels |
|---|---|---|
| `es-py-en-a1-*`, `es-py-en-a2-*` | `es-PY>en-speaker` (English speaker → Paraguayan Spanish) | A1 + A2, positions 1–24 |
| `en-es-a1-*`, `en-es-a2-*` | `en>es-speaker` (Paraguayan Spanish speaker → English) | A1 + A2, positions 1–24 |
| `es-py-sv-a1-*` | `es-PY>sv-speaker` (Swedish speaker → Paraguayan Spanish) | A1, positions 1–12 |

Each was generated from the matching map in `content/curriculum/` and validated with
`npm run lessons:validate`, which runs the same Zod schema the import route enforces plus
cross-file checks (position collisions within a pair, duplicate topics, meta-commentary in
`targetHints`). Run it after editing any lesson file — it needs no database and no API key.

Note that the two Spanish-target decks deliberately share lesson titles: they teach the same
Paraguayan situations to English and Swedish speakers, and the seeder scopes its
already-exists check to the pair for exactly that reason.

`listen_prompt` exercises appear from position 6 onward (position 3 in the English deck, which
needs listening earlier); their `audioText` is synthesized and played but never displayed.

### Checks

```bash
npm run lint              # incl. the §14.3 provider-abstraction rule
npm run typecheck
npm run lessons:validate  # content vs. the import schema
npm test                  # unit tests (node:test via tsx)
```

All four are offline — no database, no Gemini key, no TTS key — and all four run in CI
(`.github/workflows/ci.yml`) on every push and pull request.

`tests/` covers the pure logic that runs unattended for weeks and fails silently rather than
loudly: the SM-2-lite scheduler (§13.3 intervals, the ease floor, the interval cap), the
XP/streak decision (§12.2 daily goal, the one-shield-per-ISO-week rule, milestones, and the
timezone rule that keeps Asunción and Stockholm from corrupting each other's streaks), the
monthly TTS char cap that is the only thing between the billed Google project and a silent bill
(§16 defect 2), the §15.3 tier gate, the §6.4 retry-hint clamp, the listening-audio cache key,
the three-locale dictionary's key/arity parity, and the request schemas at the trust boundary
(§6.3 bounds, exactly-one-input, the CEFR enum, §3.4 forward compatibility).

`tests/seedPairs.test.ts` covers the seam §10.3 calls the most important detail in the app: the
`patternKey` taxonomy lives in seed **data** (`scripts/seedPairs.ts`) and is substituted into the
system prompt by **code** (`assembleSystemPrompt`), and nothing but a test connects the two. A
template that spells `{{error_taxonomy}}` any other way ships the literal placeholder to the
model, and the only symptom is a dashboard that slowly fills with junk. The test asserts both
directions — no slot reaches the model unsubstituted, and the assembler substitutes no slot the
templates don't declare — for all three pairs in both modes. That is also why the pair rows were
split out of `seed.ts`: that file runs `main()` on import, so its data half had to move somewhere
a test can read without opening a database connection.

Nothing in `tests/` touches the database — the DB-backed halves of `srs.ts`/`gamification.ts`
are deliberately not mocked, because a mock of Drizzle would test the mock. Those paths are
verified live, against Neon, in the Phase 0 verification session.

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
