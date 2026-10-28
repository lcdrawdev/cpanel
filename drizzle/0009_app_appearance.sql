CREATE TABLE "device_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"group_id" uuid,
	"device_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "app_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "app_logo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "home_show_favorites" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "home_show_sport" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "home_show_trending" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "tmdb_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "tmdb_language" text DEFAULT 'pt-BR' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "sports_group_keywords" jsonb DEFAULT '["ESPORTE","JOGOS DO DIA","SPORT","ESPN","PREMIERE","COMBATE","UFC","F1","NBA","NFL"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "customer_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "device_messages" ADD CONSTRAINT "device_messages_group_id_device_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."device_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_messages" ADD CONSTRAINT "device_messages_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;