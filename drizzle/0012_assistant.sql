CREATE TABLE "assistant_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_cards" (
	"device_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"status" text NOT NULL,
	"until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_cards_device_id_card_id_pk" PRIMARY KEY("device_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "assistant_profiles" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"teams" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"series" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"genres" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kinds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"finished" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decayed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_cards" ADD CONSTRAINT "assistant_cards_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;