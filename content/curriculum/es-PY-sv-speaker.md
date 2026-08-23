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
sequencing in `content/curriculum/es-PY-en-speaker.md` — same positions, same topics, same
titles, same can-do statements — except where the substitution table below replaces a row.**
Read that file as the map; this file records only what differs. As of the A2 rework that is
three rows, and the reason is in the table: these learners are visitors, not residents.

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

## Answered: they are VISITING, not moving — and that is why this deck now diverges

The owner's answer (NEXT-SESSION.md, decision 3): **the parents are visiting Paraguay, not
moving there.** They stay with family, for weeks at a time, several times. That settles the
question this file has carried since pass 1, and it makes this the first real divergence from
`content/curriculum/es-PY-en-speaker.md`: the trigger is a difference in the learners' lives,
exactly as required above, not a difference in their passports.

**The A1 twelve are unchanged.** Greetings, clarification, money, food, transport and health are
what any human needs in their first week, resident or guest.

### Substitution table — A2 (positions 13–24)

| position | English map (resident) | this deck (visitor) | why |
|---|---|---|---|
| 16 | `repair-and-maintenance` — calling a plumber about a leak | `day-trips-and-excursions` — Areguá, the lake, agreeing a departure time | A guest does not call the plumber; the family does. A guest is taken on trips, and needs to be able to ask how long the drive is and when they will be back. |
| 18 | `renting-an-apartment` — contracts, deposits, ANDE meters | `being-a-houseguest` — offering to help, declining a fourth helping, the tereré guampa going round | Nobody visiting their daughter signs a lease. Everybody visiting their daughter has to survive the sobremesa. |
| 24 | `resolving-a-service-issue` — returning faulty goods | `buying-gifts-and-souvenirs` — ñandutí, ao po'i, asking for a price, getting it wrapped | Marginal for a visitor at A2: a return needs an argument and a receipt, and a guest's shopping is presents to take home. |

Positions 13, 14, 15, 17, 19, 20, 21, 22 and 23 keep the English map's topics: money, the
colectivo, the despensa, restaurants, the pharmacy, the siesta rhythm, a SIM card, being invited
out, and taxis are all visitor situations already.

**Not yet placed:** `talking-about-sweden` — describing home, seasons and family to people who
ask, which every visitor is asked about within a day. It is the first candidate for the B1 block
whenever this pair's B1 is written; there was no A2 slot worth spending on it once the three
above were taken.

### B1 (positions 25–33), when it is written

The same rule applies, and the English map's `residency-paperwork` (#28) and its bank/transfer
lessons are the obvious cuts. Replacement candidates, in order: `talking-about-sweden`,
longer-distance travel (Encarnación, the Jesuit missions, crossing to Argentina), health with a
chronic prescription from home, and talking with grandchildren — including being talked to in
Guaraní-flavoured Spanish by children who switch registers without noticing.
