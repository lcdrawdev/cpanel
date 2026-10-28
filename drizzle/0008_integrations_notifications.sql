CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "notify_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "notify_device_added" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "notify_device_removed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "notify_channel_report" boolean DEFAULT true NOT NULL;