import { GoogleGenAI } from '@google/genai';

// Constructing with an unset key does not throw (it only warns) - safe to import
// eagerly. A real call without a valid key fails at request time, which is where
// that error belongs (see src/lib/db/index.ts for the same pattern/reasoning).
export const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// PLAN.md §9 Q7: model IDs were verified July 2026 and must be re-verified against
// ai.google.dev before this is trusted in production - preview/GA model names churn.
export const GEMINI_LESSON_MODEL = process.env.GEMINI_LESSON_MODEL || 'gemini-3.6-flash';
