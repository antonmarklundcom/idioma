CREATE TYPE "public"."explanation_language" AS ENUM('native', 'target', 'both');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_notes" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fact_learning" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "explanation_language" "explanation_language" DEFAULT 'native' NOT NULL;