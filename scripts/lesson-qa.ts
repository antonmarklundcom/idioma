/**
 * Content quality checks for content/lessons/*.json - the things `lessons:validate`
 * deliberately does not look at.
 *
 * The importer's Zod schema answers "will this import". It says nothing about whether
 * the Spanish is Paraguayan, whether a fill-the-gap exercise's answer actually matches
 * its own sentence, or whether a listening prompt gives away its own answer. Those
 * are the mistakes a generated pack actually makes, and every one of them is silent:
 * the lesson imports, renders, and quietly teaches the wrong thing.
 *
 * Run: npm run lessons:qa                     (every file in content/lessons)
 *      npm run lessons:qa path/to/pack.json   (one pack, e.g. before importing it)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lessonImportItemSchema } from '../src/lib/zodSchemas';

const LESSONS_DIR = join(process.cwd(), 'content', 'lessons');

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(LESSONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(LESSONS_DIR, f));

/**
 * Tuteo and Peninsular forms in Spanish the learner will HEAR or SAY. Every pair in
 * this app teaches Paraguayan Spanish, where these are simply wrong - and they are
 * exactly what a model reaches for when its attention drifts (PLAN.md §9 Q12).
 * Only checked in Spanish-only fields; a gloss may of course discuss "tú".
 */
const TUTEO =
  /\b(tú|tienes|puedes|quieres|vienes|dices|haces|eres|sabes|tomas|traes|llamas|hablas|vosotros|tenéis|podéis|queréis)\b/i;

/** Swedish grammar labels leaking into an English-speaker pack, and vice versa. */
const SWEDISH_LABELS = /\b(presens|imperativ|nutid)\b/;

type Finding = { file: string; where: string; message: string };
const findings: Finding[] = [];
let lessonCount = 0;

function spanishFields(content: Record<string, unknown>): string[] {
  const out: string[] = [];
  const vocab = (content.vocab ?? []) as { term?: string }[];
  for (const v of vocab) if (v.term) out.push(v.term);

  const dialogue = content.dialogue as { lines?: { text?: string }[] } | undefined;
  for (const line of dialogue?.lines ?? []) if (line.text) out.push(line.text);

  const exercises = (content.exercises ?? []) as Record<string, unknown>[];
  for (const e of exercises) {
    for (const key of ['audioText', 'sentence', 'answer'] as const) {
      const value = e[key];
      if (typeof value === 'string') out.push(value);
    }
    const hints = e.targetHints;
    if (Array.isArray(hints)) for (const h of hints) if (typeof h === 'string') out.push(h);
  }
  return out;
}

for (const file of files) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    findings.push({ file, where: '-', message: `not valid JSON: ${(error as Error).message}` });
    continue;
  }
  if (!Array.isArray(parsed)) {
    findings.push({ file, where: '-', message: 'expected an array of lessons' });
    continue;
  }

  for (const raw of parsed) {
    const result = lessonImportItemSchema.safeParse(raw);
    // Shape problems are lessons:validate's job; QA only inspects what imports.
    if (!result.success) continue;
    const lesson = result.data;
    lessonCount += 1;
    const where = `${lesson.languagePairCode} ${lesson.level} pos ${lesson.position}`;
    const content = lesson.content as unknown as Record<string, unknown>;
    const report = (message: string) => findings.push({ file, where, message });

    for (const text of spanishFields(content)) {
      const hit = TUTEO.exec(text);
      if (hit) report(`tuteo/Peninsular form "${hit[0]}" in Spanish the learner uses: "${text}"`);
    }

    if (lesson.languagePairCode.endsWith('en-speaker')) {
      const hit = SWEDISH_LABELS.exec(JSON.stringify(lesson));
      if (hit) report(`Swedish grammar label "${hit[0]}" in an English-speaker lesson`);
    }

    for (const [i, exercise] of lesson.content.exercises.entries()) {
      const e = exercise as Record<string, unknown>;
      if (e.type !== 'fill_gap_speak') continue;
      const sentence = String(e.sentence ?? '');
      const answer = typeof e.answer === 'string' ? e.answer : null;
      if (!sentence.includes('___')) {
        report(`exercise ${i}: fill_gap_speak sentence has no "___" gap`);
        continue;
      }
      if (!answer) continue;
      const [before, after] = sentence.split('___');
      // The answer has to BE the sentence with the gap filled. When it isn't, the
      // learner sees one sentence and is graded against another.
      const escape = (s: string) => s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const shape = new RegExp(`^${escape(before)}\\s*(.+?)\\s*${escape(after)}$`);
      const match = shape.exec(answer.trim());
      if (!match) {
        report(
          `exercise ${i}: answer is not the sentence with its gap filled\n     sentence: ${sentence}\n     answer:   ${answer}`,
        );
        continue;
      }
      const filled = match[1];
      const hints = Array.isArray(e.targetHints) ? e.targetHints.join(' ') : '';
      // Case-insensitive: a gap at the start of a sentence is capitalised there and
      // lowercase in the hint, which is correct in both places.
      if (hints && !hints.toLowerCase().includes(filled.toLowerCase())) {
        report(`exercise ${i}: the gap fills with "${filled}", which no targetHint mentions`);
      }
    }
  }
}

if (findings.length === 0) {
  console.log(`${lessonCount} lessons across ${files.length} file(s): no content issues.`);
  process.exit(0);
}

for (const f of findings) {
  console.error(`${f.file}\n  ${f.where}: ${f.message}`);
}
console.error(`\n${findings.length} content issue(s) across ${lessonCount} lessons.`);
process.exit(1);
