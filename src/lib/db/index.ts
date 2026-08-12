// ⚠️ DO NOT replace neon-http with a TCP Postgres driver (neon-serverless over WebSocket,
// node-postgres, postgres.js). Hostinger's shared servers have broken IPv6 routing to Neon's
// Postgres endpoints — TCP resolves IPv6 and hangs on every query. neon-http issues each
// query as an HTTPS fetch, which routes fine. See PLAN.md §3.1 and §6.13 before changing this.
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Next.js evaluates every route module at build time to collect page data — even
// routes that never touch the database — so this module must not throw on import,
// e.g. before Phase 0 sets DATABASE_URL in hPanel. neon-http doesn't open a
// connection at construction time (it fetches per query), so a placeholder
// connection string here only surfaces as a real error the first time a route
// actually queries the database, which is the correct place for it to fail.
const sql = neon(process.env.DATABASE_URL || 'postgresql://unset:unset@unset.invalid/unset');

export const db = drizzle(sql, { schema });
