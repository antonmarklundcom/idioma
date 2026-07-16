import { Type, type Schema } from '@google/genai';
import { geminiClient, GEMINI_LESSON_MODEL } from './client';

// Mirrors src/lib/zodSchemas.ts feedbackResultSchema - the provider-neutral contract
// (PLAN.md §4.1, §14.2). Keep the two in sync if either changes.
const feedbackSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    transcription: { type: Type.STRING },
    errors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, enum: ['pronunciation', 'grammar', 'vocab'] },
          severity: { type: Type.STRING, enum: ['minor', 'moderate', 'major'] },
          quote: { type: Type.STRING },
          correction: { type: Type.STRING },
          explanation: { type: Type.STRING },
          patternKey: { type: Type.STRING },
        },
        required: ['category', 'severity', 'quote', 'correction', 'explanation', 'patternKey'],
      },
    },
    correctedUtterance: { type: Type.STRING },
    tutorReply: { type: Type.STRING },
    followUpQuestion: { type: Type.STRING },
  },
  required: ['transcription', 'errors', 'correctedUtterance', 'tutorReply', 'followUpQuestion'],
};

export async function getLessonFeedbackFromAudio(args: {
  audioBase64: string;
  mimeType: string;
  systemPrompt: string;
  userTurnContext: string;
}): Promise<unknown> {
  const res = await geminiClient.models.generateContent({
    model: GEMINI_LESSON_MODEL,
    contents: [
      { inlineData: { mimeType: args.mimeType, data: args.audioBase64 } },
      { text: args.userTurnContext },
    ],
    config: {
      systemInstruction: args.systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: feedbackSchema,
    },
  });
  return JSON.parse(res.text ?? '');
}

export async function getLessonFeedbackFromText(args: {
  text: string;
  systemPrompt: string;
  userTurnContext: string;
}): Promise<unknown> {
  const res = await geminiClient.models.generateContent({
    model: GEMINI_LESSON_MODEL,
    contents: [{ text: `${args.userTurnContext}\n\nLearner's answer: ${args.text}` }],
    config: {
      systemInstruction: args.systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: feedbackSchema,
    },
  });
  return JSON.parse(res.text ?? '');
}
