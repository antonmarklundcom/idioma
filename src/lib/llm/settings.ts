import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { appSettings } from '@/lib/db/schema';
import { llmSettingsSchema, type LlmSettings, type ModelSelection } from '@/lib/zodSchemas';
import { PROVIDERS, type LlmTask, type ProviderId } from './catalog';

const SETTINGS_KEY = 'llm_models';

// Env vars are the FALLBACK, not the source of truth: the DB row wins whenever it
// exists, so switching models is a click in /admin, not a redeploy (PLAN.md §14.4).
// With no DB row and no env override this resolves to the launch defaults, which is
// exactly how the app behaved before the switcher existed.
function defaultsFromEnv(): LlmSettings {
  const providerId = (process.env.LLM_PROVIDER || 'gemini') as ProviderId;
  const modelId =
    providerId === 'gemini'
      ? process.env.GEMINI_LESSON_MODEL || 'gemini-3.6-flash'
      : process.env.OPENAI_FEEDBACK_MODEL || '';
  const fallback: ModelSelection = { providerId, modelId };
  return {
    tasks: { lesson_feedback: fallback, live_conversation: fallback },
    openaiTranscribeModelId: process.env.OPENAI_TRANSCRIBE_MODEL || '',
  };
}

// Serverless instances are short-lived and each one reads this at most twice a
// minute; a change in /admin is live everywhere within the TTL. Deliberately not a
// long cache - a stale model choice is a billing surprise.
const CACHE_TTL_MS = 30_000;
let cache: { value: LlmSettings; expiresAt: number } | null = null;

export function invalidateLlmSettingsCache(): void {
  cache = null;
}

export async function getLlmSettings(): Promise<LlmSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const defaults = defaultsFromEnv();
  let value = defaults;

  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, SETTINGS_KEY));

    if (row) {
      // Validate on READ as well as write: this row is hand-editable in the
      // database, and a malformed one must not reach the provider layer.
      const parsed = llmSettingsSchema.safeParse(row.value);
      if (parsed.success) {
        value = { ...defaults, ...parsed.data, tasks: { ...defaults.tasks, ...parsed.data.tasks } };
      } else {
        console.error('[llm/settings] ignoring malformed app_settings row, using env defaults');
      }
    }
  } catch (err) {
    // A settings read must never take down a lesson - fall back to env defaults.
    console.error('[llm/settings] read failed, using env defaults', err);
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function saveLlmSettings(
  settings: LlmSettings,
  updatedByUserId: string,
): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: settings, updatedByUserId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: settings, updatedByUserId, updatedAt: new Date() },
    });
  invalidateLlmSettingsCache();
}

export async function getModelSelection(task: LlmTask): Promise<ModelSelection> {
  const settings = await getLlmSettings();
  const selected = settings.tasks[task];
  if (selected) return selected;
  const fallback = defaultsFromEnv().tasks[task];
  return fallback ?? { providerId: 'gemini', modelId: '' };
}

/** Which provider keys are present. Booleans only - never the key values. */
export function providerKeyStatus(): Record<ProviderId, boolean> {
  return {
    gemini: Boolean(process.env[PROVIDERS.gemini.apiKeyEnvVar]),
    openai: Boolean(process.env[PROVIDERS.openai.apiKeyEnvVar]),
  };
}
