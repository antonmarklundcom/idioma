import { getLessonFeedbackFromText, transcribeAudio } from '@/lib/openai/lessonFeedback';
import type { FeedbackArgs, LlmProvider } from './provider';
import { getLlmSettings } from './settings';

// The ONLY consumer of lib/openai/* (PLAN.md §14.2), mirroring the Gemini adapter.
//
// The capability difference §14.2 anticipated is real here: OpenAI's chat models
// don't take the learner's recording, so this adapter transcribes first and then
// asks for feedback on the text. Two consequences the admin UI states plainly:
//   1. Two API calls per turn instead of one - more latency, more cost.
//   2. Pronunciation errors are gone. Text cannot carry them, so the prompt tells
//      the model not to guess at them (§4.4 made the same call for the true-Live
//      transcript path). Grammar and vocabulary coaching are unaffected.
// Gemini remains the better fit for a *speaking* app; this exists so the choice is
// yours to make and to reverse.
export const openaiProvider: LlmProvider = {
  async getFeedback(args: FeedbackArgs): Promise<unknown> {
    if (args.input.kind === 'text') {
      return getLessonFeedbackFromText({
        text: args.input.text,
        systemPrompt: args.systemPrompt,
        userTurnContext: args.userTurnContext,
        model: args.model,
      });
    }

    const { openaiTranscribeModelId } = await getLlmSettings();
    if (!openaiTranscribeModelId) {
      throw new Error(
        'OpenAI needs a speech-to-text model for spoken turns - set one in /admin (it has no audio-native chat model here).',
      );
    }

    const text = await transcribeAudio({
      audioBase64: args.input.base64,
      mimeType: args.input.mimeType,
      model: openaiTranscribeModelId,
    });

    return getLessonFeedbackFromText({
      text,
      systemPrompt: args.systemPrompt,
      userTurnContext: args.userTurnContext,
      model: args.model,
      fromTranscript: true,
    });
  },
};
