import { getLessonFeedbackFromAudio, getLessonFeedbackFromText } from '@/lib/gemini/lessonFeedback';
import { getQuickReplyFromAudio, getQuickReplyFromText } from '@/lib/gemini/quickReply';
import type { FeedbackArgs, LlmProvider, QuickReplyArgs } from './provider';

// The ONLY consumer of lib/gemini/* (PLAN.md §14.2). Everything else imports
// lib/llm/provider.ts instead.
export const geminiProvider: LlmProvider = {
  async getFeedback(args: FeedbackArgs): Promise<unknown> {
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
  },

  // Gemini takes the recording directly, so the reply-only call starts the moment the
  // upload lands - which is what makes the §8 Phase 7B split worth its second request.
  async getQuickReply(args: QuickReplyArgs): Promise<unknown> {
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
  },
};
