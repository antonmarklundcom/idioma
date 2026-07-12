/**
 * Idempotent seed: inserts the two launch language pairs and any lessons found
 * in content/lessons/*.json. Safe to re-run (skips rows that already exist).
 *
 * Run: npm run db:seed   (requires DATABASE_URL in .env / environment)
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { languagePairs, lessonContent } from '../src/lib/db/schema';

// ---------------------------------------------------------------------------
// Prompt templates. Slots ({{...}}) are filled at request time by
// src/lib/gemini/prompts.ts (Phase 3). All pair-specific tutor behavior lives
// HERE in data — never in application code (PLAN.md §3.3).
// The owner should review and refine this wording; it is a working draft.
// ---------------------------------------------------------------------------

const ES_TAXONOMY = [
  'ser-vs-estar',
  'gender-agreement',
  'number-agreement',
  'verb-conjugation-present',
  'verb-conjugation-past',
  'voseo-conjugation',
  'por-vs-para',
  'preposition-choice',
  'missing-article',
  'word-order',
  'false-friend',
  'anglicism',
  'vocabulary-choice',
  'reflexive-verbs',
  'subjunctive-missing',
  'pronunciation-vowels',
  'pronunciation-rr',
  'pronunciation-stress',
  'pronunciation-j-g',
  'other',
];

const EN_TAXONOMY = [
  'third-person-s',
  'verb-tense-past',
  'verb-tense-perfect',
  'missing-article',
  'article-choice',
  'preposition-choice',
  'word-order',
  'plural-forms',
  'false-friend',
  'hispanicism',
  'vocabulary-choice',
  'question-formation',
  'negation',
  'auxiliary-do',
  'pronunciation-th',
  'pronunciation-vowels',
  'pronunciation-final-consonants',
  'pronunciation-stress',
  'pronunciation-h',
  'other',
];

const tutorTemplate = (targetLabel: string, nativeLabel: string) => `
You are a friendly, patient ${targetLabel} tutor working with a learner whose
native language is ${nativeLabel}. Learner level: {{level}}.

Dialect and style guidance: {{dialect_notes}}
Correction approach: {{correction_style}}
Coaching style for this learner: {{coaching_profile}}

The learner's known recurring weaknesses (watch for these especially):
{{recurring_errors}}

Current lesson context: {{lesson_context}}

Listen to the learner's recording. Respond ONLY with JSON matching the given
schema:
- "transcription": exactly what the learner said, in ${targetLabel}.
- "errors": each real error with category (pronunciation|grammar|vocab),
  severity (minor|moderate|major), the quoted fragment, the correction, and a
  short explanation written in ${nativeLabel}. For "patternKey" you MUST pick
  the closest key from this list (use "other" only if nothing fits):
  {{error_taxonomy}}
- "correctedUtterance": the learner's utterance, corrected, in ${targetLabel}.
- "tutorReply": a warm, natural reply in simple ${targetLabel} appropriate to
  the learner's level. React to WHAT they said, not only how they said it.
- "followUpQuestion": one short question in ${targetLabel} that keeps the
  conversation going.
Do not invent errors. If the utterance is fully correct, return an empty
errors array and praise briefly in the tutorReply.
`.trim();

const conversationTemplate = (targetLabel: string, nativeLabel: string) => `
You are a friendly ${targetLabel} conversation partner (native language of the
learner: ${nativeLabel}; level: {{level}}). This is free conversation practice,
not a graded exercise.

Dialect and style guidance: {{dialect_notes}}
Correction approach: {{correction_style}}
Coaching style for this learner: {{coaching_profile}}
Known recurring weaknesses: {{recurring_errors}}

Respond ONLY with JSON matching the given schema. Prioritize natural
back-and-forth: keep "tutorReply" SHORT (1-2 conversational sentences in
${targetLabel}), always continue the topic the learner raised, and ask a
"followUpQuestion" that a friend would ask. Still report real errors in
"errors" (patternKey from: {{error_taxonomy}}), but never lecture in the
reply itself.
`.trim();

const PAIRS = [
  {
    code: 'es-PY>en-speaker',
    targetLang: 'es-PY',
    nativeLang: 'en',
    displayName: 'Spanish (Paraguay)',
    dialectNotes:
      'Paraguayan Spanish: use voseo (vos tenés, vos sos, ¿qué querés?) not tuteo. ' +
      'Prefer local vocabulary where natural (tereré, yuyos, chipa). Avoid Guaraní words unless the learner uses them first. ' +
      'Accept both voseo and tuteo from the learner but model voseo in replies.',
    correctionStyle:
      'Encouraging and concise. Correct every real error but never more than the learner can absorb; ' +
      'lead with what was communicated successfully. Explanations in English, one or two sentences each.',
    tutorPromptTemplate: tutorTemplate('Paraguayan Spanish', 'English'),
    conversationPromptTemplate: conversationTemplate('Paraguayan Spanish', 'English'),
    errorTaxonomy: ES_TAXONOMY,
    ttsVoice: null as string | null, // set in Phase 3 after listing available es-US Neural2 voices
  },
  {
    code: 'en>es-speaker',
    targetLang: 'en',
    nativeLang: 'es-PY',
    displayName: 'English',
    dialectNotes:
      'General American English. The learner is a Paraguayan Spanish speaker; anticipate transfer errors ' +
      '(missing third-person -s, article omission, /h/ dropping, vowel epenthesis before s-clusters).',
    correctionStyle:
      'Alentador y conciso. Corregí todos los errores reales sin abrumar; destacá primero lo que se entendió bien. ' +
      'Explicaciones en español (rioplatense/paraguayo, voseo), una o dos frases cada una.',
    tutorPromptTemplate: tutorTemplate('English', 'Paraguayan Spanish'),
    conversationPromptTemplate: conversationTemplate('English', 'Paraguayan Spanish'),
    errorTaxonomy: EN_TAXONOMY,
    ttsVoice: null as string | null, // set in Phase 3 after listing available en-US Neural2 voices
  },
];

async function main() {
  for (const pair of PAIRS) {
    const existing = await db
      .select({ id: languagePairs.id })
      .from(languagePairs)
      .where(eq(languagePairs.code, pair.code));
    if (existing.length > 0) {
      console.log(`language_pair ${pair.code} already exists, skipping`);
      continue;
    }
    await db.insert(languagePairs).values(pair);
    console.log(`inserted language_pair ${pair.code}`);
  }

  // Import every lesson file in content/lessons (arrays of lesson objects).
  const lessonsDir = join(process.cwd(), 'content', 'lessons');
  let files: string[] = [];
  try {
    files = readdirSync(lessonsDir).filter((f) => f.endsWith('.json'));
  } catch {
    console.log('no content/lessons directory, skipping lesson import');
  }

  for (const file of files) {
    const lessons = JSON.parse(readFileSync(join(lessonsDir, file), 'utf8'));
    for (const lesson of lessons) {
      const [pair] = await db
        .select({ id: languagePairs.id })
        .from(languagePairs)
        .where(eq(languagePairs.code, lesson.languagePairCode));
      if (!pair) {
        console.warn(`${file}: unknown languagePairCode ${lesson.languagePairCode}, skipping`);
        continue;
      }
      const dup = await db
        .select({ id: lessonContent.id })
        .from(lessonContent)
        .where(eq(lessonContent.title, lesson.title));
      if (dup.length > 0) {
        console.log(`lesson "${lesson.title}" already exists, skipping`);
        continue;
      }
      await db.insert(lessonContent).values({
        languagePairId: pair.id,
        level: lesson.level,
        topic: lesson.topic,
        title: lesson.title,
        position: lesson.position ?? 0,
        content: lesson.content,
      });
      console.log(`inserted lesson "${lesson.title}" (${lesson.level})`);
    }
  }

  console.log('seed complete');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
