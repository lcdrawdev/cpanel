CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "channel_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"playlist_id" uuid,
	"channel_name" text NOT NULL,
	"channel_id" text,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "channel_reports" ADD CONSTRAINT "channel_reports_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reports" ADD CONSTRAINT "channel_reports_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE set null ON UPDATE no action;