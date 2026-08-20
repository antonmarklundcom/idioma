/**
 * Validates content/lessons/*.json against the SAME schema the importer uses
 * (lessonImportItemSchema - /api/admin/content and scripts/seed.ts both run it),
 * so a content batch can be checked without a database or an API key.
 *
 * Run: npm run lessons:validate            (every file in content/lessons)
 *      npm run lessons:validate -- a.json  (specific files)
 *
 * Exits non-zero on the first kind of problem it finds, so it works in CI.
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

type Row = { file: string; pair: string; level: string; position: number; title: string; topic: string };

const rows: Row[] = [];
const errors: string[] = [];

for (const file of files) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`${file}: not valid JSON - ${(err as Error).message}`);
    continue;
  }
  if (!Array.isArray(parsed)) {
    errors.push(`${file}: top level must be an array of lessons`);
    continue;
  }
  parsed.forEach((item, i) => {
    const result = lessonImportItemSchema.safeParse(item);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${file}[${i}] ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
      return;
    }
    const lesson = result.data;
    rows.push({
      file,
      pair: lesson.languagePairCode,
      level: lesson.level,
      position: lesson.position,
      title: lesson.title,
      topic: lesson.topic,
    });
  });
}

// Cross-file checks the per-item schema cannot express. Position collisions are
// the dangerous one: the lesson list orders by position, so two lessons sharing
// one slot in the same pair silently hide each other in the browser.
const seenPosition = new Map<string, Row>();
const seenTopic = new Map<string, Row>();
for (const row of rows) {
  const positionKey = `${row.pair}::${row.position}`;
  const prior = seenPosition.get(positionKey);
  if (prior) {
    errors.push(
      `duplicate position ${row.position} for pair ${row.pair}: ` +
        `"${prior.title}" (${prior.file}) and "${row.title}" (${row.file})`,
    );
  } else {
    seenPosition.set(positionKey, row);
  }

  const topicKey = `${row.pair}::${row.topic}`;
  const priorTopic = seenTopic.get(topicKey);
  if (priorTopic) {
    errors.push(
      `duplicate topic "${row.topic}" for pair ${row.pair}: ` +
        `${priorTopic.file} and ${row.file}`,
    );
  } else {
    seenTopic.set(topicKey, row);
  }
}

// scripts/seed.ts skips a lesson whose title already exists FOR THE SAME PAIR, so
// two lessons in one pair sharing a title means the second never seeds. Across
// pairs it is fine and expected (the Swedish and English decks teach the same
// Spanish situations under the same Spanish titles).
const seenTitle = new Map<string, Row>();
for (const row of rows) {
  const key = `${row.pair}::${row.title}`;
  const prior = seenTitle.get(key);
  if (prior) {
    errors.push(
      `duplicate title "${row.title}" within pair ${row.pair} ` +
        `(${prior.file} and ${row.file}) - the seeder would skip the second one`,
    );
  } else {
    seenTitle.set(key, row);
  }
}

const byPair = new Map<string, Row[]>();
for (const row of rows) {
  const list = byPair.get(row.pair) ?? [];
  list.push(row);
  byPair.set(row.pair, list);
}
for (const [pair, list] of [...byPair].sort()) {
  list.sort((a, b) => a.position - b.position);
  const levels = [...new Set(list.map((r) => r.level))].join(', ');
  console.log(
    `${pair}: ${list.length} lessons (${levels}) - positions ` +
      `${list.map((r) => r.position).join(', ')}`,
  );
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`\n${rows.length} lessons across ${byPair.size} pair(s): all valid.`);
