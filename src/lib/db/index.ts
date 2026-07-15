import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Next.js evaluates every route module at build time to collect page data — even
// routes that never touch the database — so this module must not throw on import,
// e.g. before Phase 0 sets DATABASE_URL on Vercel. neon-http doesn't open a
// connection at construction time (it fetches per query), so a placeholder
// connection string here only surfaces as a real error the first time a route
// actually queries the database, which is the correct place for it to fail.
const sql = neon(process.env.DATABASE_URL || 'postgresql://unset:unset@unset.invalid/unset');

export const db = drizzle(sql, { schema });
