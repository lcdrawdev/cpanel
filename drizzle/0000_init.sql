CREATE TYPE "public"."device_status" AS ENUM('pending', 'active', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('android_tv', 'android_mobile', 'apple', 'tizen', 'webos', 'roku', 'other');--> statement-breakpoint
CREATE TYPE "public"."playlist_type" AS ENUM('xtream', 'm3u');--> statement-breakpoint
CREATE TYPE "public"."profile_platform" AS ENUM('tv', 'mobile', 'apple');--> statement-breakpoint
CREATE TABLE "activation_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"max_uses" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"profile_id" uuid,
	"playlist_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activation_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_playlists" (
	"device_id" uuid NOT NULL,
	"playlist_id" uuid NOT NULL,
	CONSTRAINT "device_playlists_device_id_playlist_id_pk" PRIMARY KEY("device_id","playlist_id")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"nickname" text NOT NULL,
	"platform" "platform" DEFAULT 'other' NOT NULL,
	"status" "device_status" DEFAULT 'pending' NOT NULL,
	"profile_id" uuid,
	"token_hash" text,
	"config_version" integer DEFAULT 1 NOT NULL,
	"app_version" text,
	"model" text,
	"last_seen_at" timestamp with time zone,
	"activated_with_code_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_device_id_unique" UNIQUE("device_id"),
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "playlist_type" NOT NULL,
	"url" text NOT NULL,
	"username_enc" text,
	"password_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"platform" "profile_platform" NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_profile_id_settings_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."settings_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_playlists" ADD CONSTRAINT "device_playlists_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_playlists" ADD CONSTRAINT "device_playlists_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_profile_id_settings_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."settings_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;