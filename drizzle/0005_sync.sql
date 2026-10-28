CREATE TABLE "sync_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_name" text NOT NULL,
	"playlist_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_playlists" (
	"playlist_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "sync_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "sync_playlists" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "sync_settings" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "sync_favorites" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "sync_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "sync_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_favorites" ADD CONSTRAINT "sync_favorites_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_playlists" ADD CONSTRAINT "sync_playlists_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_settings" ADD CONSTRAINT "account_settings_sync_profile_id_settings_profiles_id_fk" FOREIGN KEY ("sync_profile_id") REFERENCES "public"."settings_profiles"("id") ON DELETE set null ON UPDATE no action;