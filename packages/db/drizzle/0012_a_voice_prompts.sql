ALTER TABLE "prompt_answer" ADD COLUMN "voice_stage" text;--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD COLUMN "voice_content_type" text;--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD COLUMN "voice_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD COLUMN "voice_peaks" smallint[];--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD CONSTRAINT "prompt_answer_voice_stage_check" CHECK ("prompt_answer"."voice_stage" in ('uploading', 'processing', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD CONSTRAINT "prompt_answer_voice_type_check" CHECK ("prompt_answer"."voice_content_type" in ('audio/webm', 'audio/mp4', 'audio/ogg'));--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD CONSTRAINT "prompt_answer_voice_duration" CHECK ("prompt_answer"."voice_duration_ms" is null or "prompt_answer"."voice_duration_ms" between 1 and 30500);