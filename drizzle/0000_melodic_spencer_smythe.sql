CREATE TYPE "public"."cefr_level" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1');--> statement-breakpoint
CREATE TYPE "public"."error_category" AS ENUM('pronunciation', 'grammar', 'vocab');--> statement-breakpoint
CREATE TYPE "public"."practice_mode" AS ENUM('lesson', 'live');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('learner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('minor', 'moderate', 'major');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "error_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_pair_id" uuid NOT NULL,
	"category" "error_category" NOT NULL,
	"pattern_key" text NOT NULL,
	"description" text NOT NULL,
	"example_quote" text,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "language_pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"target_lang" text NOT NULL,
	"native_lang" text NOT NULL,
	"display_name" text NOT NULL,
	"dialect_notes" text,
	"correction_style" text,
	"tutor_prompt_template" text NOT NULL,
	"conversation_prompt_template" text,
	"error_taxonomy" jsonb NOT NULL,
	"tts_voice" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "language_pairs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lesson_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_pair_id" uuid NOT NULL,
	"level" "cefr_level" NOT NULL,
	"topic" text NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_pair_id" uuid NOT NULL,
	"mode" "practice_mode" NOT NULL,
	"lesson_id" uuid,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"role" "role" DEFAULT 'learner' NOT NULL,
	"native_lang" text,
	"target_lang" text,
	"level" "cefr_level",
	"language_pair_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "utterances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"speaker" text DEFAULT 'user' NOT NULL,
	"audio_ref" text,
	"transcript" text,
	"corrected" text,
	"tutor_reply" text,
	"follow_up_question" text,
	"errors" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_patterns" ADD CONSTRAINT "error_patterns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_patterns" ADD CONSTRAINT "error_patterns_language_pair_id_language_pairs_id_fk" FOREIGN KEY ("language_pair_id") REFERENCES "public"."language_pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_content" ADD CONSTRAINT "lesson_content_language_pair_id_language_pairs_id_fk" FOREIGN KEY ("language_pair_id") REFERENCES "public"."language_pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_language_pair_id_language_pairs_id_fk" FOREIGN KEY ("language_pair_id") REFERENCES "public"."language_pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_lesson_id_lesson_content_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson_content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_language_pair_id_language_pairs_id_fk" FOREIGN KEY ("language_pair_id") REFERENCES "public"."language_pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utterances" ADD CONSTRAINT "utterances_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utterances" ADD CONSTRAINT "utterances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ep_unique" ON "error_patterns" USING btree ("user_id","language_pair_id","pattern_key");--> statement-breakpoint
CREATE INDEX "lc_pair_level_idx" ON "lesson_content" USING btree ("language_pair_id","level","topic");--> statement-breakpoint
CREATE INDEX "ps_user_idx" ON "practice_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "ul_user_day_idx" ON "usage_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "utt_session_idx" ON "utterances" USING btree ("session_id");