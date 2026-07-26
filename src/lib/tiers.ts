import type { UserTier } from '@/lib/db/schema';

/**
 * Per-tier capabilities (PLAN.md §15.3).
 *
 * This is the gate, not a billing system. It exists so an expensive mode can be
 * switched on for one person without a deploy, and so the check has one home
 * instead of being scattered across routes as `if (user.tier === ...)`.
 *
 * Deliberately NOT gated today: turn-based live conversation (§4.3). It runs on
 * the same free-tier Gemini call as lesson mode and costs $0, so putting it
 * behind a tier would take away something that is free to give. `realtimeVoice`
 * covers the Gemini Live API path (§4.2), which is the one that actually costs
 * ~$0.90/hour - it has no route yet, and this flag is what will guard it.
 */
export type Capabilities = {
  /** Early-warning cap against runaway loops (§6.5), not a product limit. */
  dailyAttemptCap: number;
  /** True real-time voice-to-voice via the Gemini Live API (§4.2). Costs money. */
  realtimeVoice: boolean;
};

export const TIER_CAPABILITIES: Record<UserTier, Capabilities> = {
  // 100 is the value that shipped in Phase 3 - free tier keeps today's behavior
  // exactly, so adding this gate is not a regression for anyone.
  free: { dailyAttemptCap: 100, realtimeVoice: false },
  premium: { dailyAttemptCap: 300, realtimeVoice: true },
};

/** Unknown/missing tier resolves to the least-privileged one, never the most. */
export function capabilitiesFor(tier: UserTier | null | undefined): Capabilities {
  return TIER_CAPABILITIES[tier ?? 'free'] ?? TIER_CAPABILITIES.free;
}
