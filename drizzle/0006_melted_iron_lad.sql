CREATE TYPE "public"."user_tier" AS ENUM('free', 'premium');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tier" "user_tier" DEFAULT 'free' NOT NULL;