# Curriculum map — `es-PY>sv-speaker` (Swedish speaker learning Paraguayan Spanish)

**Status:** pass-1 output, owner-editable. Input to pass 2 of
`content/prompts/curriculum-generation.md`.

**Learners:** the owner's parents (PLAN.md §9 Q12). Coaching profile: not yet chosen by them —
it is picked at onboarding (§11.3), so the content must work under either. In practice that
means writing to the stricter constraint: no exercise may *depend* on being corrected
explicitly, and none may depend on being let off lightly.

## This map is the Spanish map, in Swedish. That is the whole design.

The target language here is identical to `es-PY>en-speaker`: Paraguayan Spanish, voseo, tereré,
chipa, guaraníes. A learner in Asunción needs the same twelve survival situations in the same
order whether they arrived from Sweden or from the United States. **So this pair reuses the
sequencing in `content/curriculum/es-PY-en-speaker.md` verbatim — all 40 rows, same positions,
same topics, same titles, same can-do statements.** Read that file as the map; this file records
only what differs.

Writing a second independent 40-row map would have produced a near-copy with gratuitous
divergences, and every future fix would then have to be made twice and would drift. If the two
decks ever *should* diverge, the trigger is a real difference in the learners' lives (see the
open question below), not a difference in their passports.

## What actually differs

**1. Metalanguage.** `intro`, vocab `gloss` and vocab `note` are in **Swedish**. Vocab `term`,
`audioText`, and everything the learner is asked to say stay in Paraguayan Spanish, exactly as
in the English deck. Exercise `prompt` is Swedish.

**2. The interference errors being targeted.** This is the substantive difference, and it is
why the deck is not a translation of the English one. `SV_ES_TAXONOMY` in `scripts/seed.ts`
already names the Swedish-speaker patterns, and the lesson notes should pre-empt them where the
situation naturally raises them:

| Swedish-speaker error | Where the deck should name it |
|---|---|
| `definite-suffix-transfer` — Swedish glues the article on the end (`huset`), Spanish puts a separate word in front (`la casa`) | First noun-heavy lesson (#3 numbers/prices, #4 food) |
| `att-infinitive-transfer` — `att äta` → an inserted particle before Spanish infinitives | #10 daily routine, #11 making plans (`quiero ir`, not `quiero a ir`) |
| `word-order-v2` — Swedish V2 leaking in (`Idag jag är...` → `Hoy soy...` word order errors, inverted subjects after adverbials) | #10 and #12, where sentences finally get long enough for it to show |
| `ser-vs-estar` — Swedish `vara` is one verb where Spanish has two | Everywhere, but named explicitly at #1 and #9 |
| `pronunciation-sj-tj` — the Swedish sj-/tj- sounds substituting for Spanish `j`, `ll`, `rr` | #2 clarification (where repair phrases get drilled) and #5 tereré (`yuyo`, `guampa`) |
| `false-friend` — Swedish/Spanish false friends, plus English ones arriving via the learners' English | Wherever they occur; note them in `note`, never in a separate lesson |

**3. Nothing else.** Same situations, same recycling graph, same level split (A1 12 / A2 12 /
B1 9 / B2 7).

## Open question for the owner — answer before A2 is written

**Are your parents visiting Paraguay, or moving there?** The A1 twelve are right either way:
greetings, clarification, money, food, transport and health are what any human needs in the
first week. But the A2 and B1 blocks inherited from the English map assume a *resident*:
#14 renting an apartment, #20 opening a bank account and transferring money, #22 calling a
repair technician, #28 residency paperwork. For visitors staying with family, those four are
close to dead weight, and the slots would be better spent on being a guest in someone's home,
pharmacy and chronic-medication vocabulary, longer-distance travel, and talking with
grandchildren.

Given the answer, this file gets a short substitution table for positions 13–33 and the English
map keeps its own. Until then, only A1 (1–12) should be generated for this pair — those twelve
are correct under either answer, which is exactly why they are safe to write now.
