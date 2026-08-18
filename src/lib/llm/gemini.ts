import { ApiError } from '@google/genai';
import { getLessonFeedbackFromAudio, getLessonFeedbackFromText } from '@/lib/gemini/lessonFeedback';
import { getQuickReplyFromAudio, getQuickReplyFromText } from '@/lib/gemini/quickReply';
import { parseRetryDelaySeconds, ProviderRateLimitError } from './errors';
import type { FeedbackArgs, LlmProvider, QuickReplyArgs } from './provider';

/**
 * Translate Google's 429 into the provider-neutral error (PLAN.md §6.4, §14.2). This
 * mapping belongs to the adapter for the same reason response shapes do: the route must
 * not learn what a Gemini error looks like. Everything else propagates unchanged.
 */
async function mapProviderErrors<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    // Duck-typed alongside the instanceof check: a dual-package/bundling mismatch would
    // make `instanceof` quietly false, and the cost of missing a 429 here is telling the
    // learner to retry immediately against a quota that just ran out (§6.4).
    const status = err instanceof ApiError ? err.status : (err as { status?: unknown })?.status;
    if (status === 429) {
      throw new ProviderRateLimitError(
        parseRetryDelaySeconds(err instanceof Error ? err.message : undefined),
      );
    }
    throw err;
  }
}

// The ONLY consumer of lib/gemini/* (PLAN.md §14.2). Everything else imports
// lib/llm/provider.ts instead.
export const geminiProvider: LlmProvider = {
  async getFeedback(args: FeedbackArgs): Promise<unknown> {
    return mapProviderErrors(async () => {
      if (args.input.kind === 'audio') {
        return getLessonFeedbackFromAudio({
          audioBase64: args.input.base64,
          mimeType: args.input.mimeType,
          systemPrompt: args.systemPrompt,
          userTurnContext: args.userTurnContext,
          model: args.model,
        });
      }
      return getLessonFeedbackFromText({
        text: args.input.text,
        systemPrompt: args.systemPrompt,
        userTurnContext: args.userTurnContext,
        model: args.model,
      });
    });
  },

  // Gemini takes the recording directly, so the reply-only call starts the moment the
  // upload lands - which is what makes the §8 Phase 7B split worth its second request.
  async getQuickReply(args: QuickReplyArgs): Promise<unknown> {
    return mapProviderErrors(async () => {
      if (args.input.kind === 'audio') {
        return getQuickReplyFromAudio({
          audioBase64: args.input.base64,
          mimeType: args.input.mimeType,
          systemPrompt: args.systemPrompt,
          userTurnContext: args.userTurnContext,
          model: args.model,
        });
      }
      return getQuickReplyFromText({
        text: args.input.text,
        systemPrompt: args.systemPrompt,
        userTurnContext: args.userTurnContext,
        model: args.model,
      });
    });
  },
};
