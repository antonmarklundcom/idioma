/**
 * Idempotent seed: inserts the three launch language pairs and any lessons found
 * in content/lessons/*.json. Safe to re-run (skips rows that already exist).
 *
 * Run: npm run db:seed   (requires DATABASE_URL in .env / environment)
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { languagePairs, lessonContent, users } from '../src/lib/db/schema';
import { lessonImportItemSchema } from '../src/lib/zodSchemas';

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
  'preterite-vs-imperfect',
  'conditional-forms',
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
  'subjunctive-wrong-trigger',
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

// PLAN.md §9 Q12: Swedish-native -> Paraguayan-Spanish learner. Templates are
// written IN SWEDISH (the learner reads explanations in their native language),
// following the same slot structure as the English/es-PY pair above.
const SV_ES_TAXONOMY = [
  'ser-vs-estar', // är/vara kollapsas till ett enda spanskt verb
  'gender-agreement',
  'number-agreement',
  'verb-conjugation-present',
  'verb-conjugation-past',
  'preterite-vs-imperfect',
  'conditional-forms',
  'voseo-conjugation',
  'por-vs-para',
  'preposition-choice',
  'missing-article',
  'definite-suffix-transfer', // svenska slutartiklar (-en/-et) i stället för spansk artikel
  'att-infinitive-transfer', // "att" + infinitiv appliceras rakt av på spanska infinitiv
  'word-order-v2', // svensk V2-ordföljd läcker in i spanskan
  'false-friend', // falska vänner
  'anglicism',
  'vocabulary-choice',
  'reflexive-verbs',
  'subjunctive-missing',
  'subjunctive-wrong-trigger',
  'pronunciation-vowels',
  'pronunciation-rr',
  'pronunciation-stress',
  'pronunciation-sj-tj', // sj-/tj-ljud används i stället för spanskt j/ll/rr
  'other',
];

const svTutorTemplate = (targetLabel: string) => `
Du är en vänlig, tålmodig ${targetLabel}-lärare som hjälper en elev vars
modersmål är svenska. Elevens nivå: {{level}}.

Dialekt och stil: {{dialect_notes}}
Rättningsstil: {{correction_style}}
Elevens coachningsstil: {{coaching_profile}}

Elevens kända återkommande svagheter (var extra uppmärksam på dessa):
{{recurring_errors}}

Aktuellt lektionssammanhang: {{lesson_context}}

Lyssna på elevens inspelning. Svara ENDAST med JSON enligt det givna schemat:
- "transcription": exakt vad eleven sa, på ${targetLabel}.
- "errors": varje verkligt fel med category (pronunciation|grammar|vocab),
  severity (minor|moderate|major), det citerade fragmentet, rättningen och en
  kort förklaring skriven på svenska. För "patternKey" MÅSTE du välja den
  närmaste nyckeln från denna lista (använd "other" endast om inget passar):
  {{error_taxonomy}}
- "correctedUtterance": elevens yttrande, rättat, på ${targetLabel}.
- "tutorReply": ett varmt, naturligt svar på enkel ${targetLabel} anpassat
  efter elevens nivå. Reagera på VAD eleven sa, inte bara hur de sa det.
- "followUpQuestion": en kort fråga på ${targetLabel} som håller samtalet
  igång.
Hitta inte på fel. Om yttrandet är helt korrekt, returnera en tom errors-lista
och beröm kort i tutorReply.
`.trim();

const svConversationTemplate = (targetLabel: string) => `
Du är en vänlig samtalspartner på ${targetLabel} (elevens modersmål: svenska;
nivå: {{level}}). Detta är fri samtalsträning, inte en betygsatt övning.

Dialekt och stil: {{dialect_notes}}
Rättningsstil: {{correction_style}}
Elevens coachningsstil: {{coaching_profile}}
Kända återkommande svagheter: {{recurring_errors}}

Svara ENDAST med JSON enligt det givna schemat. Prioritera naturlig
fram-och-tillbaka-dialog: håll "tutorReply" KORT (1-2 samtalsmeningar på
${targetLabel}), fortsätt alltid på ämnet eleven tog upp, och ställ en
"followUpQuestion" som en vän skulle fråga. Rapportera ändå riktiga fel i
"errors" (patternKey från: {{error_taxonomy}}), men predika aldrig i själva
svaret.
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
    // Best-guess default from Google's documented es-US Neural2 catalog (PLAN.md §4.5).
    // Re-verify against GET https://texttospeech.googleapis.com/v1/voices once a real
    // GOOGLE_TTS_API_KEY exists (Phase 0) - a wrong name just degrades to text-only
    // (TTS failures are non-fatal), so this is a safe placeholder either way.
    ttsVoice: 'es-US-Neural2-A',
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
    // Best-guess default from Google's documented en-US Neural2 catalog - same
    // re-verify-at-Phase-0 caveat as the es-US voice above.
    ttsVoice: 'en-US-Neural2-C',
  },
  {
    code: 'es-PY>sv-speaker',
    targetLang: 'es-PY',
    nativeLang: 'sv',
    displayName: 'Spanska (Paraguay) för svensktalande',
    // Same substance as the English-speaker es-PY row above (PLAN.md §9 Q12):
    // Paraguayan Spanish, voseo, local vocabulary.
    dialectNotes:
      'Paraguayan Spanish: use voseo (vos tenés, vos sos, ¿qué querés?) not tuteo. ' +
      'Prefer local vocabulary where natural (tereré, yuyos, chipa). Avoid Guaraní words unless the learner uses them first. ' +
      'Accept both voseo and tuteo from the learner but model voseo in replies.',
    correctionStyle:
      'Uppmuntrande och kortfattad. Rätta varje verkligt fel men överväldiga aldrig eleven; ' +
      'lyft först fram det som kommunicerades framgångsrikt. Förklaringar på svenska, en eller två meningar var.',
    tutorPromptTemplate: svTutorTemplate('paraguayansk spanska'),
    conversationPromptTemplate: svConversationTemplate('paraguayansk spanska'),
    errorTaxonomy: SV_ES_TAXONOMY,
    // Same voice as the English-speaker es-PY row: the TUTOR speaks Spanish,
    // the learner's native language only changes the explanation language.
    ttsVoice: 'es-US-Neural2-A',
  },
];

/**
 * PLAN.md §15.3: "build the gate, keep both beta users on premium". The tier column
 * defaults to 'free', so a beta user who has signed in needs one promotion - this is
 * that promotion, run from the same seed the owner already runs rather than a SQL
 * statement he has to remember. Emails come from the environment, not this file: they
 * are the two beta users' personal addresses and don't belong in a public repo.
 *
 * Rows are UPDATEd, never INSERTed: a users row is created by Auth.js on first Google
 * sign-in (§5), and a hand-made row here would have no linked account and no way to be
 * signed into. Running the seed before either user has signed in is therefore a no-op
 * that says so - re-run it after they have.
 */
async function promoteBetaUsers() {
  const emails = (process.env.PREMIUM_USER_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) {
    console.log('PREMIUM_USER_EMAILS not set, skipping tier promotion (PLAN.md §15.3)');
    return;
  }

  const promoted = await db
    .update(users)
    .set({ tier: 'premium' })
    .where(inArray(users.email, emails))
    .returning({ email: users.email });

  for (const row of promoted) console.log(`set tier=premium for ${row.email}`);
  for (const email of emails) {
    if (!promoted.some((row) => row.email.toLowerCase() === email)) {
      console.warn(`no user row for ${email} yet - sign in once, then re-run the seed`);
    }
  }
}

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
    const raw = JSON.parse(readFileSync(join(lessonsDir, file), 'utf8'));
    // The /admin import route Zod-validates every lesson; the seeder used to
    // insert whatever the file contained, so a malformed batch failed at the
    // database instead of at the file that caused it. Same schema, both paths.
    const lessons = raw.map((item: unknown, i: number) => {
      const result = lessonImportItemSchema.safeParse(item);
      if (!result.success) {
        throw new Error(
          `${file}[${i}] is not a valid lesson: ` +
            result.error.issues
              .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
              .join('; '),
        );
      }
      return result.data;
    });
    for (const lesson of lessons) {
      const [pair] = await db
        .select({ id: languagePairs.id })
        .from(languagePairs)
        .where(eq(languagePairs.code, lesson.languagePairCode));
      if (!pair) {
        console.warn(`${file}: unknown languagePairCode ${lesson.languagePairCode}, skipping`);
        continue;
      }
      // Scoped to the pair on purpose: the Swedish-speaker and English-speaker
      // decks teach the same Paraguayan situations under the same Spanish
      // titles, so a title-only check would silently skip every lesson of
      // whichever pair seeded second.
      const dup = await db
        .select({ id: lessonContent.id })
        .from(lessonContent)
        .where(and(eq(lessonContent.languagePairId, pair.id), eq(lessonContent.title, lesson.title)));
      if (dup.length > 0) {
        console.log(`lesson "${lesson.title}" (${lesson.languagePairCode}) already exists, skipping`);
        continue;
      }
      await db.insert(lessonContent).values({
        languagePairId: pair.id,
        level: lesson.level,
        topic: lesson.topic,
        title: lesson.title,
        position: lesson.position,
        content: lesson.content,
      });
      console.log(`inserted lesson "${lesson.title}" (${lesson.languagePairCode} ${lesson.level})`);
    }
  }

  await promoteBetaUsers();

  console.log('seed complete');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
