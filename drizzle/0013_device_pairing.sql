ALTER TABLE "devices" ADD COLUMN "mac" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "self_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "pairing_code_hash" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "pairing_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "pairing_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_mac_unique" UNIQUE("mac");