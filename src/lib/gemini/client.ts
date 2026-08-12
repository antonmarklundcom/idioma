import { GoogleGenAI } from '@google/genai';

// Constructing with an unset key does not throw (it only warns) - safe to import
// eagerly. A real call without a valid key fails at request time, which is where
// that error belongs (see src/lib/db/index.ts for the same pattern/reasoning).
export const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Model IDs are no longer read here: the model comes from the admin-selected
// setting per task (PLAN.md §14.4, src/lib/llm/settings.ts), with
// GEMINI_LESSON_MODEL as the fallback when nothing has been chosen yet.
// §9 Q7 still applies - re-verify model IDs against ai.google.dev before trusting
// them in production, since preview/GA names churn.
