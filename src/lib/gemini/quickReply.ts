import { Type, type Schema } from '@google/genai';
import { geminiClient } from './client';

// PLAN.md §8 Phase 7B item 1. The same turn, the same system prompt, the same audio -
// but asking for only the two fields the learner is about to HEAR. Two properties and
// no error analysis means a handful of output tokens instead of ~350, so this returns
// well before the structured call does and Cloud TTS gets to start early.
//
// Mirrors the tutorReply/followUpQuestion half of src/lib/zodSchemas.ts
// feedbackResultSchema - keep the two in sync if either changes.
const quickReplySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    tutorReply: { type: Type.STRING },
    followUpQuestion: { type: Type.STRING },
  },
  required: ['tutorReply', 'followUpQuestion'],
};

export async function getQuickReplyFromAudio(args: {
  audioBase64: string;
  mimeType: string;
  systemPrompt: string;
  userTurnContext: string;
  model: string;
}): Promise<unknown> {
  const res = await geminiClient.models.generateContent({
    model: args.model,
    contents: [
      { inlineData: { mimeType: args.mimeType, data: args.audioBase64 } },
      { text: args.userTurnContext },
    ],
    config: {
      systemInstruction: args.systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: quickReplySchema,
    },
  });
  return JSON.parse(res.text ?? '');
}

export async function getQuickReplyFromText(args: {
  text: string;
  systemPrompt: string;
  userTurnContext: string;
  model: string;
}): Promise<unknown> {
  const res = await geminiClient.models.generateContent({
    model: args.model,
    contents: [{ text: `${args.userTurnContext}\n\nLearner's answer: ${args.text}` }],
    config: {
      systemInstruction: args.systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: quickReplySchema,
    },
  });
  return JSON.parse(res.text ?? '');
}
