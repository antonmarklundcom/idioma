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
import { SEED_PAIRS } from './seedPairs';

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
  for (const pair of SEED_PAIRS) {
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
