// Provider-neutral model registry (PLAN.md §14.4). Pure data + types: no SDK
// imports, so the admin UI and the route layer can both read it without pulling
// a vendor client into the bundle.
//
// Model IDs and prices churn constantly (§10.7). Nothing here is a hardcoded
// runtime dependency: the admin page can always store a model ID that isn't
// listed below, and a model whose price we don't know renders as "unknown"
// rather than a guess.

export const LLM_TASKS = ['lesson_feedback', 'live_conversation'] as const;
export type LlmTask = (typeof LLM_TASKS)[number];

export const PROVIDER_IDS = ['gemini', 'openai'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const TASK_LABELS: Record<LlmTask, string> = {
  lesson_feedback: 'Lesson feedback',
  live_conversation: 'Live conversation',
};

export const TASK_DESCRIPTIONS: Record<LlmTask, string> = {
  lesson_feedback:
    'Every recorded turn in a lesson: transcription, error list, correction, tutor reply.',
  live_conversation:
    'Every turn in the /live conversation loop. Same pipeline, conversational prompt.',
};

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  /** Env var holding this provider's key. Presence is surfaced in /admin; the value never is. */
  apiKeyEnvVar: string;
  /**
   * Whether the provider's chat models take the learner's recording directly.
   * `false` means the adapter runs a separate speech-to-text call first, which
   * costs extra and adds latency - surfaced as a warning in /admin.
   */
  acceptsAudioDirectly: boolean;
  pricingUrl: string;
};

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    acceptsAudioDirectly: true,
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    acceptsAudioDirectly: false,
    pricingUrl: 'https://platform.openai.com/docs/pricing',
  },
};

export type ModelSpec = {
  id: string;
  providerId: ProviderId;
  label: string;
  /** USD per 1M tokens. null = we have not verified a price; the UI says so. */
  inputPricePerMTok: number | null;
  outputPricePerMTok: number | null;
  /** True when the model is usable on the provider's free tier at this project's scale. */
  freeTier: boolean;
  notes: string;
};

/**
 * Known models. Only entries whose numbers were actually verified are listed with
 * prices - see PLAN.md §0 "Verified external facts" (Gemini, July 2026).
 *
 * The OpenAI list is intentionally empty: this repo has no verified OpenAI model
 * IDs or prices, and inventing them would put a fake number in front of the
 * person deciding what to spend. Populate it from OPENAI_FEEDBACK_MODELS (see
 * `.env.example`) or just type the model ID into /admin - both paths work.
 */
export const KNOWN_MODELS: ModelSpec[] = [
  {
    id: 'gemini-3.6-flash',
    providerId: 'gemini',
    label: 'Gemini 3.6 Flash',
    inputPricePerMTok: 1.5,
    outputPricePerMTok: 7.5,
    freeTier: true,
    notes:
      'Launch default. Takes the recording directly, no transcription step. Free tier ~1,500 req/day. Prices verified July 2026.',
  },
  {
    id: 'gemini-flash-latest',
    providerId: 'gemini',
    label: 'Gemini Flash (latest alias)',
    inputPricePerMTok: null,
    outputPricePerMTok: null,
    freeTier: true,
    notes:
      'Alias that always points at the current Flash. Convenient, but the model can change under you without warning.',
  },
];

function envModelList(): ModelSpec[] {
  const raw = process.env.OPENAI_FEEDBACK_MODELS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => ({
      id,
      providerId: 'openai' as const,
      label: id,
      inputPricePerMTok: null,
      outputPricePerMTok: null,
      freeTier: false,
      notes: 'From OPENAI_FEEDBACK_MODELS. Prices not verified by this app - check the pricing page.',
    }));
}

/** Known models plus anything listed in OPENAI_FEEDBACK_MODELS. */
export function listModels(): ModelSpec[] {
  return [...KNOWN_MODELS, ...envModelList()];
}

export function findModel(providerId: ProviderId, modelId: string): ModelSpec | undefined {
  return listModels().find((m) => m.providerId === providerId && m.id === modelId);
}

// --- Cost estimation -------------------------------------------------------
// One spoken turn, measured in tokens, is roughly: the system prompt (coaching
// profile + taxonomy + recurring errors) and the audio, in; the feedback JSON,
// out. These are deliberate order-of-magnitude estimates so /admin can answer
// "what does switching cost me?" - they are not billing figures.
export const TURN_TOKEN_ESTIMATE = { input: 3000, output: 400 } as const;

export type CostEstimate = { per100Turns: number } | null;

export function estimateCostPer100Turns(model: ModelSpec | undefined): CostEstimate {
  if (!model || model.inputPricePerMTok === null || model.outputPricePerMTok === null) {
    return null;
  }
  const perTurn =
    (TURN_TOKEN_ESTIMATE.input / 1_000_000) * model.inputPricePerMTok +
    (TURN_TOKEN_ESTIMATE.output / 1_000_000) * model.outputPricePerMTok;
  return { per100Turns: perTurn * 100 };
}
