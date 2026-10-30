CREATE TABLE "app_updates" (
	"platform" "platform" PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"version_code" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"mandatory" boolean DEFAULT false NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_data" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
