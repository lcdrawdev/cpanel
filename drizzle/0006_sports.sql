ALTER TABLE "account_settings" ADD COLUMN "sports_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "hidden_sports" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "hidden_sport_entries" jsonb DEFAULT '[]'::jsonb NOT NULL;