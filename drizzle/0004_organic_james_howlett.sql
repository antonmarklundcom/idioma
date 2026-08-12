ALTER TYPE "public"."practice_mode" ADD VALUE 'review';--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_pair_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_ref" text NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"ease_factor_x100" integer DEFAULT 250 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp DEFAULT now() NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_language_pair_id_language_pairs_id_fk" FOREIGN KEY ("language_pair_id") REFERENCES "public"."language_pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ri_unique" ON "review_items" USING btree ("user_id","kind","source_ref");--> statement-breakpoint
CREATE INDEX "ri_due_idx" ON "review_items" USING btree ("user_id","due_at");