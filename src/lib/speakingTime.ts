/**
 * Speaking time (ROADMAP.md P1.5b follow-on): the metric that tracks fluency, and the
 * one nothing was counting. Seconds are logged per turn to `usage_log`; this decides
 * what a week's worth of them should say on the dashboard.
 */

export type SpeakingTimeReading =
  | { kind: 'none' }
  /** Some speaking, but rounding it to minutes would print "0 minutes". */
  | { kind: 'under_a_minute' }
  | { kind: 'minutes'; minutes: number };

export function describeSpeakingTime(seconds: number): SpeakingTimeReading {
  if (!Number.isFinite(seconds) || seconds <= 0) return { kind: 'none' };
  if (seconds < 60) return { kind: 'under_a_minute' };
  // Rounded, not floored: 119 seconds is closer to two minutes than to one, and this
  // is an encouragement number rather than an invoice.
  return { kind: 'minutes', minutes: Math.round(seconds / 60) };
}
