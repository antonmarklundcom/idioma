// PLAN.md §8 Phase 8: shared fetch wrapper for the client screens that call
// Gemini-backed API routes (lesson attempt, live conversation, review queue) - a
// single place to time out a stuck request and classify why a call failed, so 429s
// and timeouts get their own friendly copy instead of a generic error message.

// Gemini audio calls can legitimately take 5-20s (PLAN.md §4.1); this leaves a wide
// margin before the client gives up and calls it a timeout.
const FETCH_TIMEOUT_MS = 45_000;

export type ApiErrorKind = 'rate_limited' | 'timeout' | 'network' | 'other';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; kind: ApiErrorKind; message?: string };

export async function fetchJson<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string; code?: string });
      const kind: ApiErrorKind =
        res.status === 429 || data.code === 'daily_limit_reached'
          ? 'rate_limited'
          : res.status === 504 || res.status === 524 || res.status === 408
            ? 'timeout'
            : 'other';
      return { ok: false, kind, message: data.error };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, kind: 'timeout' };
    }
    return { ok: false, kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
