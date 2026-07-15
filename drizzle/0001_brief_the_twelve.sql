CREATE TYPE "public"."coaching_profile" AS ENUM('confidence_first', 'accuracy_focus');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "coaching_profile" "coaching_profile";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "focus_skills" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text;