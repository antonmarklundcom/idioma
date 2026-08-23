CREATE TABLE "lesson_audio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"lesson_id" uuid NOT NULL,
	"audio_base64" text NOT NULL,
	"char_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_audio" ADD CONSTRAINT "lesson_audio_lesson_id_lesson_content_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_audio_key_idx" ON "lesson_audio" USING btree ("cache_key");--> statement-breakpoint
CREATE INDEX "lesson_audio_lesson_idx" ON "lesson_audio" USING btree ("lesson_id");