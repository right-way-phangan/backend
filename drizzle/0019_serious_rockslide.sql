CREATE TABLE "object_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"object_id" integer NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"name" text,
	"phone" text,
	"line" text,
	"whatsapp" text,
	"telegram" text,
	"note" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "object_contacts" ADD CONSTRAINT "object_contacts_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "object_contacts_object_idx" ON "object_contacts" USING btree ("object_id");--> statement-breakpoint
-- Backfill: carry the legacy free-text objects.owner_name into the new
-- structured store as the primary owner contact (name only — phone/channel
-- get split out by hand in the object card). owner_name is left in place as a
-- migration source; new UI writes through object_contacts only.
INSERT INTO "object_contacts" ("object_id", "role", "name", "is_primary")
SELECT "id", 'owner', btrim("owner_name"), true
FROM "objects"
WHERE "owner_name" IS NOT NULL AND btrim("owner_name") <> '';
