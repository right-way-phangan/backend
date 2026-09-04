CREATE TABLE "partners" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"messenger" text,
	"linked_rw" text[],
	"terms_status" text DEFAULT 'draft' NOT NULL,
	"terms_sent_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"terms_artifact" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"partner_id" integer NOT NULL,
	"object_rw" text,
	"status" text DEFAULT 'teaser_sent' NOT NULL,
	"teaser_text" text,
	"teaser_sent_at" timestamp with time zone DEFAULT now(),
	"confirmed_at" timestamp with time zone,
	"ack_artifact" text,
	"handed_at" timestamp with time zone,
	"fee_milestone" text,
	"protection_until" timestamp with time zone,
	"next_follow_up" timestamp with time zone,
	"last_client_touch" timestamp with time zone,
	"verified_by" text,
	"lost_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partners_terms_status_idx" ON "partners" USING btree ("terms_status");--> statement-breakpoint
CREATE INDEX "referrals_status_idx" ON "referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "referrals_partner_idx" ON "referrals" USING btree ("partner_id");