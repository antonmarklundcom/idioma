import { openaiPostForm, openaiPostJson } from './client';

// JSON Schema mirror of src/lib/zodSchemas.ts feedbackResultSchema - the same
// provider-neutral contract the Gemini adapter satisfies with responseSchema
// (PLAN.md §4.1, §14.2). Strict mode requires every property listed in `required`
// and additionalProperties: false at every level.
const feedbackJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    transcription: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: ['pronunciation', 'grammar', 'vocab'] },
          severity: { type: 'string', enum: ['minor', 'moderate', 'major'] },
          quote: { type: 'string' },
          correction: { type: 'string' },
          explanation: { type: 'string' },
          patternKey: { type: 'string' },
        },
        required: ['category', 'severity', 'quote', 'correction', 'explanation', 'patternKey'],
      },
    },
    correctedUtterance: { type: 'string' },
    tutorReply: { type: 'string' },
    followUpQuestion: { type: 'string' },
  },
  required: ['transcription', 'errors', 'correctedUtterance', 'tutorReply', 'followUpQuestion'],
} as const;

// OpenAI's transcription endpoint keys off the filename extension, so the
// recorder's real MIME type has to map to one (PLAN.md §10.1 - iOS sends
// audio/mp4, Android audio/webm; never assume either).
const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
};

function extensionFor(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return EXTENSION_BY_MIME[base] ?? 'webm';
}

/** Speech-to-text. Needed because OpenAI's chat models don't take the raw recording. */
export async function transcribeAudio(args: {
  audioBase64: string;
  mimeType: string;
  model: string;
}): Promise<string> {
  const bytes = Buffer.from(args.audioBase64, 'base64');
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: args.mimeType }),
    `utterance.${extensionFor(args.mimeType)}`,
  );
  form.append('model', args.model);

  const res = (await openaiPostForm('/audio/transcriptions', form)) as { text?: string };
  if (!res.text) throw new Error('OpenAI transcription returned no text');
  return res.text;
}

export async function getLessonFeedbackFromText(args: {
  text: string;
  systemPrompt: string;
  userTurnContext: string;
  model: string;
  /**
   * True when `text` came out of the transcription step rather than the learner
   * typing it. The model is then told not to invent pronunciation errors it
   * cannot hear - see the note in src/lib/llm/openai.ts.
   */
  fromTranscript?: boolean;
}): Promise<unknown> {
  const transcriptNote = args.fromTranscript
    ? "\n\nThe learner's answer below is a speech-to-text transcript - you did NOT hear the " +
      'audio. Copy it verbatim into `transcription`. Do not report pronunciation errors: you ' +
      'have no audio to judge them from, and a transcript cannot show them. Grammar and ' +
      'vocabulary errors are fair game as usual.'
    : '';

  const res = (await openaiPostJson('/chat/completions', {
    model: args.model,
    messages: [
      { role: 'system', content: args.systemPrompt + transcriptNote },
      { role: 'user', content: `${args.userTurnContext}\n\nLearner's answer: ${args.text}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'lesson_feedback', strict: true, schema: feedbackJsonSchema },
    },
  })) as { choices?: { message?: { content?: string } }[] };

  const content = res.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');
  return JSON.parse(content);
}
