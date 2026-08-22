/**
 * Apply pending Drizzle migrations as part of the production build.
 *
 * Why this exists: migrations used to be a manual step the owner ran from their
 * own machine. A merged PR that added a column therefore deployed code whose
 * schema did not exist yet, and because Auth.js uses database sessions, the
 * first symptom was that NOBODY COULD LOG IN - reported as an opaque
 * "problem with the server configuration". That happened once; this closes it.
 *
 * Deliberately opt-in, and deliberately not run everywhere:
 *
 * - `RUN_MIGRATIONS_ON_DEPLOY=true` must be set. On Vercel, set it for the
 *   Production environment ONLY. Preview deployments share the same database,
 *   so a preview build running a feature branch's migrations would apply
 *   unreviewed schema changes to live data.
 * - `DATABASE_URL` must be set. Without it (local `npm run build`, CI) this is
 *   a no-op, so the build stays offline-safe - CI has no database by design.
 *
 * A migration failure fails the build, which is the point: Vercel keeps the
 * previous deployment serving, so a bad migration means "no new deploy" rather
 * than "live site talking to the wrong schema".
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

async function main() {
  if (process.env.RUN_MIGRATIONS_ON_DEPLOY !== 'true') {
    console.log('[migrate] RUN_MIGRATIONS_ON_DEPLOY is not "true" - skipping.');
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.log('[migrate] no DATABASE_URL - skipping.');
    return;
  }

  console.log('[migrate] applying pending migrations from ./drizzle …');
  const db = drizzle(neon(process.env.DATABASE_URL));
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('[migrate] done - schema is up to date.');
}

main().catch((error) => {
  // Loud and specific: this runs in a build log nobody reads until something breaks.
  console.error('[migrate] FAILED - the deployment is being stopped so the current');
  console.error('[migrate] version keeps serving. Fix the migration, then redeploy.');
  console.error(error);
  process.exit(1);
});
