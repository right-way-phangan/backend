CREATE TABLE "ai_citations" (
	"source" text NOT NULL,
	"path" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_citations_source_path_day_pk" PRIMARY KEY("source","path","day")
);
