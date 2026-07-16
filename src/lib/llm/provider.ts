// Provider-neutral interface (PLAN.md §14). Routes and components import ONLY this
// file - never @google/genai or lib/gemini/* directly - so swapping models later is
// one new adapter + an env change, not a route rewrite.
import { geminiProvider } from './gemini';

export type FeedbackArgs = {
  systemPrompt: string;
  userTurnContext: string;
  input: { kind: 'audio'; base64: string; mimeType: string } | { kind: 'text'; text: string };
};

export interface LlmProvider {
  /** Returns the §4.1 feedback JSON shape (unvalidated) - caller Zod-validates. */
  getFeedback(args: FeedbackArgs): Promise<unknown>;
}

export function getProvider(): LlmProvider {
  const name = process.env.LLM_PROVIDER || 'gemini';
  switch (name) {
    case 'gemini':
      return geminiProvider;
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${name}`);
  }
}
