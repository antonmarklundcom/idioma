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

export interface LlmProvider {
  /** Returns the §4.1 feedback JSON shape (unvalidated) - caller Zod-validates. */
  getFeedback(args: FeedbackArgs): Promise<unknown>;
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
