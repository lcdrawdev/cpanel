CREATE TABLE "account_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"maintenance_enabled" boolean DEFAULT false NOT NULL,
	"maintenance_message" text DEFAULT '' NOT NULL,
	"maintenance_support_line" text DEFAULT '' NOT NULL,
	"account_nickname" text DEFAULT '' NOT NULL,
	"support_url" text DEFAULT '' NOT NULL,
	"welcome_message" text DEFAULT '' NOT NULL,
	"force_updates" boolean DEFAULT false NOT NULL,
	"disable_cloud_backups" boolean DEFAULT false NOT NULL,
	"channel_reports_enabled" boolean DEFAULT true NOT NULL,
	"already_reported_message" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
