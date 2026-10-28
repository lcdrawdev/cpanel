CREATE TYPE "public"."portal_mode" AS ENUM('off', 'xtream', 'stalker');--> statement-breakpoint
CREATE TYPE "public"."portal_type" AS ENUM('xtream', 'stalker');--> statement-breakpoint
CREATE TABLE "predefined_portals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "portal_type" NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "portal_mode" "portal_mode" DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "brand_logo_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "brand_home_line" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "user_agent" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "activation_code_hint" text DEFAULT '' NOT NULL;