CREATE TABLE "owners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"phone" text,
	"whatsapp" text,
	"line" text,
	"telegram" text,
	"email" text,
	"lang" text,
	"status" text DEFAULT 'new' NOT NULL,
	"note" text,
	"last_touch_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "objects" ADD CONSTRAINT "objects_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE set null ON UPDATE no action;