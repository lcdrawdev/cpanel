CREATE TABLE "device_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"profile_id" uuid,
	"playlist_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_codes" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "device_groups" ADD CONSTRAINT "device_groups_profile_id_settings_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."settings_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_group_id_device_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."device_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_group_id_device_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."device_groups"("id") ON DELETE set null ON UPDATE no action;