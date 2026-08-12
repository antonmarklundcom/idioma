// Thin fetch wrapper over the OpenAI REST API. No SDK dependency on purpose: this
// adapter needs two endpoints, and an extra vendor package in the bundle buys
// nothing (PLAN.md §14 - "one thin interface, no framework").

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return key;
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
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI ${path} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}
