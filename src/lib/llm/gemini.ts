import { getLessonFeedbackFromAudio, getLessonFeedbackFromText } from '@/lib/gemini/lessonFeedback';
import type { FeedbackArgs, LlmProvider } from './provider';

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
};
