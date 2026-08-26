ALTER TABLE "language_pairs" ADD COLUMN "native_voice" text;--> statement-breakpoint
-- Backfill the three pairs scripts/seedPairs.ts already seeds in production, so this
-- lands live without a manual UPDATE or a second seed run (seed.ts skips rows that
-- already exist by code, so a plain re-seed would never reach here). Values match
-- SEED_PAIRS exactly; a pair added later gets its nativeVoice from the seed script.
UPDATE "language_pairs" SET "native_voice" = 'en-US-Neural2-C' WHERE "code" = 'es-PY>en-speaker';--> statement-breakpoint
UPDATE "language_pairs" SET "native_voice" = 'es-US-Neural2-A' WHERE "code" = 'en>es-speaker';--> statement-breakpoint
UPDATE "language_pairs" SET "native_voice" = 'sv-SE-Wavenet-A' WHERE "code" = 'es-PY>sv-speaker';