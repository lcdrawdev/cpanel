ALTER TABLE "devices" ADD COLUMN "plan_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "expiry_notice_days" integer DEFAULT 5 NOT NULL;