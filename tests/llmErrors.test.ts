import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  ProviderRateLimitError,
  clampRetryAfter,
  parseRetryDelaySeconds,
} from '@/lib/llm/errors';

// PLAN.md §6.4: "back off, never tight-loop retries". A provider hint of 0s is exactly
// the tight loop the plan forbids, and a hint of hours is indistinguishable from an
// outage to a learner holding a phone — so both ends get clamped.

describe('clampRetryAfter', () => {
  it('keeps a sensible hint as-is', () => {
    assert.equal(clampRetryAfter(27), 27);
  });

  it('rounds a fractional hint up, never down to a shorter wait', () => {
    assert.equal(clampRetryAfter(27.1), 28);
  });

  it('refuses a retry-immediately hint', () => {
    assert.ok(clampRetryAfter(0) >= 5);
    assert.ok(clampRetryAfter(-100) >= 5);
  });

  it('refuses an outage-length hint', () => {
    assert.ok(clampRetryAfter(10_800) <= 120);
  });

  it('falls back on values that are not numbers at all', () => {
    assert.equal(clampRetryAfter(NaN), DEFAULT_RETRY_AFTER_SECONDS);
    assert.equal(clampRetryAfter(Infinity), DEFAULT_RETRY_AFTER_SECONDS);
  });

  it('has a default that is itself inside the clamp range', () => {
    assert.equal(clampRetryAfter(DEFAULT_RETRY_AFTER_SECONDS), DEFAULT_RETRY_AFTER_SECONDS);
  });
});

describe('parseRetryDelaySeconds', () => {
  it('digs the RetryInfo duration out of a Google error body', () => {
    const message =
      'ClientError: got status: 429. {"error":{"code":429,"message":"Resource has been exhausted",' +
      '"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"27s"}]}}';
    assert.equal(parseRetryDelaySeconds(message), 27);
  });

  it('accepts an unquoted or fractional duration', () => {
    assert.equal(parseRetryDelaySeconds('"retryDelay": 41s'), 41);
    assert.equal(parseRetryDelaySeconds('"retryDelay":"12.5s"'), 13);
  });

  it('clamps what it finds — a hostile body cannot buy a tight loop', () => {
    assert.ok(parseRetryDelaySeconds('"retryDelay":"0s"') >= 5);
    assert.ok(parseRetryDelaySeconds('"retryDelay":"99999s"') <= 120);
  });

  it('defaults when there is no hint — the normal case, not an error', () => {
    assert.equal(parseRetryDelaySeconds(undefined), DEFAULT_RETRY_AFTER_SECONDS);
    assert.equal(parseRetryDelaySeconds(''), DEFAULT_RETRY_AFTER_SECONDS);
    assert.equal(parseRetryDelaySeconds('429 Too Many Requests'), DEFAULT_RETRY_AFTER_SECONDS);
  });
});

describe('ProviderRateLimitError', () => {
  it('clamps at construction, so the route cannot emit a Retry-After of 0', () => {
    assert.equal(new ProviderRateLimitError(0).retryAfterSeconds >= 5, true);
    assert.equal(new ProviderRateLimitError(10_800).retryAfterSeconds <= 120, true);
  });

  it('is catchable as an Error and identifies itself by name', () => {
    const err = new ProviderRateLimitError(30);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof ProviderRateLimitError);
    assert.equal(err.name, 'ProviderRateLimitError');
    assert.match(err.message, /rate limit/i);
  });
});
