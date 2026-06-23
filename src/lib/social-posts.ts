/**
 * Соц-посты — очередь черновиков с гейтом.
 *
 * Гермес (rw-marketing) через бот `/пост` пишет черновик пары EN+RU (status=draft).
 * Человек согласует/правит/публикует; фактическая публикация в канал держится до
 * запуска (launch sequencing). EN+RU связаны pairId. Короткий формат (только текст),
 * в отличие от articles (блог). См. project_ai_council.
 */
import { eq, and, desc } from "drizzle-orm";
import { socialPosts } from "../db/schema";
import type { SocialPostRow } from "../db/schema";
import type { AnyPgDatabase } from "./load";

export class SocialPostInputError extends Error {}

const STATUSES = ["draft", "scheduled", "published", "rejected"] as const;
type Status = (typeof STATUSES)[number];

export interface SocialPostInputDTO {
  pairId: string;
  lang?: string; // en | ru
  channel?: string; // telegram | ...
  topic?: string;
  body: string;
  status?: Status; // default draft
}

/** Create one draft post row (one language). */
export async function createSocialPost(
  db: AnyPgDatabase,
  input: SocialPostInputDTO,
): Promise<SocialPostRow> {
  const body = String(input.body ?? "").trim();
  const pairId = String(input.pairId ?? "").trim();
  if (!body) throw new SocialPostInputError("body is required");
  if (!pairId) throw new SocialPostInputError("pairId is required");
  const lang = input.lang === "ru" ? "ru" : "en";
  const status: Status = STATUSES.includes(input.status as Status)
    ? (input.status as Status)
    : "draft";
  const [row] = await db
    .insert(socialPosts)
    .values({
      pairId,
      lang,
      channel: (input.channel || "telegram").trim() || "telegram",
      topic: input.topic?.trim() || null,
      body,
      status,
    })
    .returning();
  return row;
}

export async function listSocialPosts(
  db: AnyPgDatabase,
  opts: { status?: Status; limit?: number } = {},
): Promise<SocialPostRow[]> {
  const conds = [];
  if (opts.status) conds.push(eq(socialPosts.status, opts.status));
  return db
    .select()
    .from(socialPosts)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(socialPosts.createdAt))
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
}

export async function getSocialPostById(
  db: AnyPgDatabase,
  id: number,
): Promise<SocialPostRow | null> {
  const [row] = await db.select().from(socialPosts).where(eq(socialPosts.id, id)).limit(1);
  return row ?? null;
}

export async function updateSocialPost(
  db: AnyPgDatabase,
  id: number,
  patch: { status?: Status; reviewerNote?: string; body?: string },
): Promise<SocialPostRow | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status && STATUSES.includes(patch.status)) {
    set.status = patch.status;
    if (patch.status === "published") set.publishedAt = new Date();
  }
  if (typeof patch.reviewerNote === "string") set.reviewerNote = patch.reviewerNote;
  if (typeof patch.body === "string" && patch.body.trim()) set.body = patch.body.trim();
  const [row] = await db
    .update(socialPosts)
    .set(set)
    .where(eq(socialPosts.id, id))
    .returning();
  return row ?? null;
}

export async function countDraftPosts(db: AnyPgDatabase): Promise<number> {
  const rows = await db
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(eq(socialPosts.status, "draft"));
  return rows.length;
}
