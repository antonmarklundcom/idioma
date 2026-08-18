// Provider-neutral error types (PLAN.md §14). Adapters translate whatever their SDK
// or HTTP client throws into these; routes catch these and never inspect a provider's
// error shape, exactly as they never inspect a provider's response shape.

/**
 * The provider refused the call because we are over ITS rate limit — Gemini's free
 * tier is 15 RPM / 1,500 RPD (PLAN.md §6.4). This is transient and retryable, which
 * makes it a different thing from our own daily cap (§6.5): that one is a wall until
 * tomorrow, this one clears in seconds.
 *
 * §6.4's mitigation is "back off, never tight-loop retries", so this carries a hint
 * for how long to wait and the route turns it into a 429 + `Retry-After`. Returning
 * the old generic 502 invited exactly the retry loop the plan warns about: a client
 * that reads "something went wrong, try again" retries immediately, and every retry
 * spends more of the same quota that just ran out.
 */
export class ProviderRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = 'Provider rate limit reached') {
    super(message);
    this.name = 'ProviderRateLimitError';
    this.retryAfterSeconds = clampRetryAfter(retryAfterSeconds);
  }
}

/** Fallback wait when the provider gives no hint. One free-tier RPM window plus slack. */
export const DEFAULT_RETRY_AFTER_SECONDS = 30;

const MIN_RETRY_AFTER_SECONDS = 5;
const MAX_RETRY_AFTER_SECONDS = 120;

/**
 * Providers report the wait in several shapes and units, and a hostile or buggy value
 * is not worth trusting: a "retry in 0s" hint is the tight loop §6.4 forbids, and a
 * "retry in 3 hours" hint is indistinguishable from an outage to a learner holding a
 * phone. Clamp to a range where both readings are honest.
 */
export function clampRetryAfter(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil(seconds)));
}

/**
 * Best-effort dig for a retry hint in a provider error message. Google returns the
 * wait inside the JSON error body as a `RetryInfo` duration (`"retryDelay": "27s"`),
 * which the SDK folds into the thrown error's message rather than exposing as a field.
 * Missing or unparseable is the normal case, not an error — hence the default.
 */
export function parseRetryDelaySeconds(text: string | undefined): number {
  if (!text) return DEFAULT_RETRY_AFTER_SECONDS;
  const match = /"retryDelay"\s*:\s*"?(\d+(?:\.\d+)?)s"?/.exec(text);
  return match ? clampRetryAfter(Number(match[1])) : DEFAULT_RETRY_AFTER_SECONDS;
}
