// Thin fetch wrapper over the OpenAI REST API. No SDK dependency on purpose: this
// adapter needs two endpoints, and an extra vendor package in the bundle buys
// nothing (PLAN.md §14 - "one thin interface, no framework").
import {
  clampRetryAfter,
  DEFAULT_RETRY_AFTER_SECONDS,
  ProviderRateLimitError,
} from '@/lib/llm/errors';

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return key;
}

/**
 * A 429 from either endpoint becomes the provider-neutral rate-limit error, so the
 * route answers it the same way whichever provider is selected in /admin (PLAN.md
 * §6.4, §14.2). OpenAI sends the wait in the standard `Retry-After` header.
 */
function rateLimitFrom(res: Response): ProviderRateLimitError {
  const header = Number(res.headers.get('retry-after'));
  return new ProviderRateLimitError(
    Number.isFinite(header) && header > 0 ? clampRetryAfter(header) : DEFAULT_RETRY_AFTER_SECONDS,
  );
}

export async function openaiPostJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${OPENAI_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 429) throw rateLimitFrom(res);
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI ${path} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export async function openaiPostForm(path: string, form: FormData): Promise<unknown> {
  const res = await fetch(`${OPENAI_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) {
    if (res.status === 429) throw rateLimitFrom(res);
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI ${path} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}
