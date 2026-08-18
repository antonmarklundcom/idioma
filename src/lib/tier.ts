import type { PracticeMode, UserTier } from '@/lib/db/schema';

/**
 * Capability gating (PLAN.md §15.3) — "build the gate, not the commerce".
 *
 * There is no billing, no checkout, no pricing and no client-visible flag. This is
 * one server-side predicate over `users.tier`, which the owner flips by hand:
 *
 *   UPDATE users SET tier = 'premium' WHERE email = '…';
 *
 * Its purpose is per-user control of an EXPENSIVE mode with no billing
 * infrastructure — the concrete case §15.3 names is enabling real-time voice for
 * one user for one month against the $10 credit, without enabling it for everyone.
 *
 * Enforce it server-side only. A client-side check is decoration: the browser can
 * call the route directly, so the route is where the answer has to be decided.
 */

/**
 * Modes that cost enough per turn to be worth gating. `lesson` and `review` are the
 * $0 core product and are never gated — gating them would gate the app itself.
 *
 * `live` is here because it is the mode that grows into the §4.2 real-time upgrade.
 * As shipped it is the $0 turn-based loop (§4.3) and costs the same as a lesson turn,
 * so both beta users sit on 'premium' (§15.3) and nobody notices the gate; it exists
 * so that turning path C on is a per-user decision instead of a global one.
 */
const PREMIUM_MODES: ReadonlySet<PracticeMode> = new Set<PracticeMode>(['live']);

/** True when the mode is reachable on this tier. Any future live-token route calls this too. */
export function tierAllowsMode(tier: UserTier, mode: PracticeMode): boolean {
  return tier === 'premium' || !PREMIUM_MODES.has(mode);
}
