# Curriculum generation prompt pack (owner-run, Gemini 3.6 Flash + extended thinking)

**Who runs this:** the owner, by hand, in AI Studio — not the app. PLAN.md §0 forbids the *app*
from generating curriculum; §9 Q11 explicitly allows the *owner* to author it with Gemini's
help. The output of this pack is owner-approved material that goes in via the Phase 5 admin
import. Nothing here runs at request time.

**Why multi-step:** one giant "generate the whole course" call produces drift — repeated vocab,
inconsistent difficulty, and a JSON blob too long to finish inside one response. Three passes
fix that: **map → batch-generate → validate**. Run pass 1 once per language pair, pass 2 once
per batch of five lessons, pass 3 once per batch.

**Settings:** Gemini 3.6 Flash, extended/deep thinking ON, temperature ~0.7 for pass 1 and ~0.4
for pass 2 (you want consistency, not creativity, once the map is fixed). Thinking tokens bill
as output — see PLAN.md §15 — but at these volumes the whole curriculum costs well under a
dollar, and on the free tier it is $0.

---

## The target format (paste this into every generation pass)

The app imports a **JSON array of lesson objects**. This is the exact shape `scripts/seed.ts`
and the Phase 5 admin importer accept — anything else fails Zod validation at import.

```jsonc
[
  {
    "languagePairCode": "es-PY>en-speaker",   // or "en>es-speaker" — exactly these two strings
    "level": "A1",                             // A1 | A2 | B1 | B2 | C1
    "topic": "greetings",                      // lowercase slug, groups lessons in the browser
    "title": "Saludos y presentaciones",       // shown to the learner, in the TARGET language
    "position": 1,                             // integer sort order within (pair, level)
    "content": {
      "intro": "…",                            // 1–3 sentences, in the learner's NATIVE language
      "vocab": [
        { "term": "…", "gloss": "…", "note": "…" }   // term = target language, gloss = native, note optional
      ],
      "exercises": [
        {
          "type": "speak_prompt",
          "prompt": "…",                       // what the learner is asked to say
          "targetHints": ["…", "…"]            // 1–4 short strings passed to the tutor as lesson context
        },
        {
          "type": "listen_prompt",             // Phase 5B only — safe to include now, player skips unknown types
          "audioText": "…",                    // TARGET language; spoken via TTS, NEVER displayed
          "prompt": "…",                       // comprehension question
          "targetHints": ["…"]
        }
      ]
    }
  }
]
```

Rules that make the difference between "imports cleanly" and "an evening of manual fixing":

- **Raw JSON only** — no ` ```json ` fences, no prose before or after, no trailing commas, no
  comments. Ask for it explicitly every time; models add fences by default.
- **`intro` is in the learner's native language.** For `es-PY>en-speaker` (English speaker
  learning Spanish) that means English. For `en>es-speaker` it means Spanish. Getting this
  backwards makes A1 lessons unusable for a beginner.
- **`title` is in the target language** — small immersion win, and it is what the lesson browser
  lists.
- **`targetHints` are the steering wheel.** They are injected into the tutor's system prompt as
  lesson context, so the model watches for exactly those forms. Use the grammatical form or
  phrase you want practiced (`"voseo"`, `"pretérito"`, `"¿de dónde sos?"`), not meta-commentary.
- **`position` must be unique and monotonic** within a (languagePairCode, level) group.
- **`unicode`, not escapes.** Write `¿cómo estás?` directly; the importer is UTF-8.

---

## Pass 1 — the curriculum map (run once per language pair)

> You are designing a spoken-fluency curriculum for a two-person private language app. Think
> carefully before answering.
>
> **Learner:** [ENGLISH SPEAKER LEARNING PARAGUAYAN SPANISH | PARAGUAYAN SPANISH SPEAKER LEARNING
> ENGLISH — pick one and delete the other]
>
> **Target outcome:** functional independence in daily life in the target-language country —
> roughly CEFR B1–B2. The learner should be able to handle work, errands, health, social life,
> and conflict in the language. This is not exam prep and not tourist phrases.
>
> **Priority for this learner:** [her: the confidence to start speaking from day one, anxiety is
> the bottleneck, not knowledge | him: grammar accuracy and listening comprehension]
>
> **Dialect:** [Paraguayan Spanish — voseo (vos tenés, ¿cómo te llamás?, sos), local vocabulary
> (tereré, chipa, yuyos), Guaraní loanwords where genuinely common in speech | General American
> English, taught to a Spanish speaker — anticipate transfer errors: missing third-person -s,
> article omission, /h/ dropping, vowel epenthesis before s-clusters]
>
> **Task:** produce a curriculum map of **40 lessons** spanning A1 → B2, as a markdown table with
> columns: `position | level | topic (lowercase slug) | title (target language) | can-do
> statement | 5–8 key vocab/structures | which earlier lesson it recycles`.
>
> Constraints:
> - Every lesson must have a **can-do statement** in the form "The learner can ___ " describing a
>   real situation, not a grammar point. Grammar is the means, never the goal.
> - Deliberately **recycle**: each lesson after position 5 must reuse vocabulary or a structure
>   from an earlier lesson. Name which one in the last column.
> - Sequence by **communicative usefulness first**, grammatical difficulty second. A learner who
>   can't yet conjugate the past tense still needs to buy food and explain they don't understand.
> - A1 (positions 1–12) must reach *survival competence*: greetings, self-introduction,
>   asking for repetition/clarification, numbers/prices, food, transport, basic health.
> - Weight the sequencing toward the priority above.
> - Do not write the lessons yet. Only the map.
>
> After the table, list anything you think is missing from this curriculum for the stated target
> outcome, and any lesson you would cut.

**Then: read it and edit it yourself.** This is the pass where your judgment matters most — you
know these two people and Gemini does not. Fix the ordering, cut the filler, add what is missing.
The edited map is the input to pass 2 and should not change afterward.

---

## Pass 2 — generate lessons (run once per batch of 5)

> You are writing lesson content for a spoken-fluency language app. Think carefully before
> answering.
>
> **Context:** [paste the learner/dialect/priority block from pass 1 verbatim]
>
> **Approved curriculum map:** [paste the FULL edited map from pass 1 — all 40 rows, so the model
> can see what comes before and after and avoid repeating vocabulary]
>
> **Your task this call:** write the full content for **positions [N]–[N+4] only**.
>
> **Output format:** [paste the entire "target format" section above, including the rules]
>
> Content requirements per lesson:
> - `intro`: 1–3 sentences in the learner's native language. Say what the learner will be able to
>   do after the lesson and flag one thing that commonly trips people up. No pep talk.
> - `vocab`: 6–10 entries. Real spoken usage, not dictionary citation forms — include the phrase
>   as it is actually said. Use `note` for dialect specifics (voseo forms, Paraguayan usage,
>   register, false friends).
> - `exercises`: 4–6 per lesson, **at least 3 of type `speak_prompt`**, ordered easy → hard. The
>   last one must be open-ended enough that a strong learner can stretch.
> - Include **1–2 `listen_prompt`** exercises per lesson from position 6 onward. `audioText` must
>   be natural connected speech in the target language, 1–3 sentences, at a level the learner can
>   *almost* handle — and must never give away the answer to its own `prompt`.
> - Every `speak_prompt` must ask for **speech in a situation**, not a translation drill. "Ask the
>   shopkeeper for two kilos of tomatoes and check the price" — not "translate: I want tomatoes."
> - Recycle from earlier lessons as specified in the map's last column.
>
> Output the JSON array and nothing else.

Repeat for positions 6–10, 11–15, … Keep each call to five lessons; longer batches start
truncating mid-array and quality drifts downward through the response.

---

## Pass 3 — validation (run once per batch, in a fresh chat)

Run this in a **new conversation** so the model reviews the JSON rather than defending what it
just wrote.

> You are a strict validator for language-learning content. Think carefully.
>
> Below is a JSON array of lessons for [learner + dialect, one line]. Check it against these
> rules and report every violation with the lesson `position` and the exact field:
>
> 1. Valid JSON, no fences, no trailing commas. `languagePairCode` is exactly `[paste the one
>    correct string]`. `level` is one of A1/A2/B1/B2/C1. `position` values are unique.
> 2. `intro` is in [NATIVE LANGUAGE]; `title` and all `vocab[].term` are in [TARGET LANGUAGE].
> 3. Every exercise has a `type` of `speak_prompt` or `listen_prompt`, and every field required
>    by that type is present and non-empty.
> 4. No `listen_prompt` whose `prompt` can be answered without hearing the `audioText`.
> 5. No vocabulary repeated from an earlier position in this batch without a reason.
> 6. Dialect consistency: [voseo throughout, no tuteo forms, no Peninsular vocabulary | General
>    American, no British spellings or idioms].
> 7. Any prompt that is a translation drill rather than a situational speaking task.
> 8. Anything factually wrong about the culture or the language.
>
> Report as a list of findings. Then output the corrected JSON array, and nothing else.
>
> [paste the batch]

Save the validated output to `content/lessons/<pair>-<level>-<topic>.json` and import it through
the Phase 5 admin UI. Spot-check one lesson per batch by hand — pass 3 catches structure, not
taste.

---

## After generation

- The **error taxonomy** (`language_pairs.error_taxonomy`, seeded in `scripts/seed.ts`) is
  separate from lesson content and drives the dashboard's recurring-mistake grouping. If the
  curriculum introduces a grammar point that has no matching `patternKey` — say the subjunctive
  arrives at B1 and the taxonomy has only `subjunctive-missing` — add keys there in the same
  session. A missing key means the tutor files real errors under `other` and they never
  aggregate (PLAN.md §10 item 3).
- The two Claude-authored sample lessons in `content/lessons/*.sample.json` are placeholders.
  Delete them once real A1 content exists, or they will show up in the lesson browser.
- Generate **A1 + A2 first** (§9 Q4) and let the learners actually use them before writing B1+.
  Curriculum written ahead of real usage is curriculum written against a guess.
