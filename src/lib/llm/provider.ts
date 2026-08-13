// Provider-neutral interface (PLAN.md §14). Routes and components import ONLY this
// file - never @google/genai or lib/gemini/* directly - so swapping models later is
// one new adapter + a setting change, not a route rewrite.
import { geminiProvider } from './gemini';
import { openaiProvider } from './openai';
import type { LlmTask, ProviderId } from './catalog';
import { getModelSelection } from './settings';

export type FeedbackArgs = {
  systemPrompt: string;
  userTurnContext: string;
  input: { kind: 'audio'; base64: string; mimeType: string } | { kind: 'text'; text: string };
  /** Chosen in /admin per task (§14.4); adapters never pick their own model. */
  model: string;
};

export type QuickReplyArgs = FeedbackArgs;

export interface LlmProvider {
  /** Returns the §4.1 feedback JSON shape (unvalidated) - caller Zod-validates. */
  getFeedback(args: FeedbackArgs): Promise<unknown>;
  /**
   * PLAN.md §8 Phase 7B item 1 ("speak before you analyze"): the tutor's spoken half
   * of the turn - `{ tutorReply, followUpQuestion }` and nothing else - so synthesis
   * can start while the full structured feedback is still being generated.
   *
   * OPTIONAL by design. A provider that has to transcribe the audio before it can say
   * anything (OpenAI, §14.2) gains no latency from a second short call and would pay
   * for a second transcription, so it simply doesn't implement this and the route
   * falls back to the single-call path. Capability differences belong here, not in
   * the route.
   */
  getQuickReply?(args: QuickReplyArgs): Promise<unknown>;
}

const PROVIDERS: Record<ProviderId, LlmProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
};

export function getProvider(providerId: ProviderId): LlmProvider {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`Unknown LLM provider: ${providerId}`);
  return provider;
}

/**
 * The one call sites should use: resolves the admin-selected provider + model for
 * a task and hands back both, so the route never hardcodes either.
 */
export async function getProviderForTask(
  task: LlmTask,
): Promise<{ provider: LlmProvider; providerId: ProviderId; model: string }> {
  const { providerId, modelId } = await getModelSelection(task);
  if (!modelId) {
    throw new Error(`No model configured for task '${task}' - set one in /admin`);
  }
  return { provider: getProvider(providerId), providerId, model: modelId };
}
