CREATE TABLE "contact_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_chat_id" bigint NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contact_messages_chat_idx" ON "contact_messages" USING btree ("client_chat_id","created_at");