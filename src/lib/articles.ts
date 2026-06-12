/**
 * Blog/Journal articles — content pipeline with review-gate.
 *
 * Claude submits a draft (status=pending). Vladimir approves it in
 * /admin/articles → status=published (live on /blog) or returns it →
 * status=rejected + reviewerNote. Body is markdown (source of truth); the
 * public blog converts it to KbBlock[] at render time.
 *
 * Every article is submitted as an EN+RU pair: two rows sharing one slug,
 * differing in lang (en → /blog/slug, ru → /ru/blog/slug). Each language is
 * reviewed and published independently. Slug is unique per (slug, lang).
 */
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { articles } from "../db/schema";
import type { ArticleRow } from "../db/schema";
import type { AnyPgDatabase } from "./load";

export class ArticleInputError extends Error {}

const STATUSES = ["pending", "published", "rejected"] as const;
type Status = (typeof STATUSES)[number];

/** ~200 wpm reading estimate, floored at 1 minute. */
function estimateReadMins(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** URL-safe slug from a title (ASCII transliteration is the caller's job). */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface ArticleInputDTO {
  slug?: string;
  lang?: string; // en | ru
  title: string;
  excerpt: string;
  topic?: string;
  bodyMd: string;
  takeaways?: string[];
  coverImage?: string;
  status?: Status; // default pending
}

/** Create a draft article (Claude content pipeline). */
export async function createArticle(db: AnyPgDatabase, input: ArticleInputDTO): Promise<ArticleRow> {
  const title = String(input.title ?? "").trim();
  const excerpt = String(input.excerpt ?? "").trim();
  const bodyMd = String(input.bodyMd ?? "").trim();
  if (!title) throw new ArticleInputError("title is required");
  if (!excerpt) throw new ArticleInputError("excerpt is required");
  if (!bodyMd) throw new ArticleInputError("bodyMd is required");

  const lang = input.lang === "ru" ? "ru" : "en";
  let slug = (input.slug?.trim() || slugify(title)) || `article-${Date.now()}`;
  // ensure uniqueness within the language — append -2, -3, … on collision
  // (the same slug in the other language is the paired translation, not a clash)
  const existing = await db
    .select({ slug: articles.slug })
    .from(articles)
    .where(
      and(
        eq(articles.lang, lang),
        sql`(${articles.slug} = ${slug} OR ${articles.slug} LIKE ${slug + "-%"})`,
      ),
    );
  if (existing.some((r) => r.slug === slug)) {
    let n = 2;
    const taken = new Set(existing.map((r) => r.slug));
    while (taken.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }

  const [row] = await db
    .insert(articles)
    .values({
      slug,
      lang,
      title,
      excerpt,
      topic: input.topic?.trim() || "Guide",
      bodyMd,
      takeaways: input.takeaways?.length ? input.takeaways : null,
      coverImage: input.coverImage?.trim() || null,
      readMins: estimateReadMins(bodyMd),
      status: STATUSES.includes(input.status as Status) ? (input.status as Status) : "pending",
    })
    .returning();
  return row;
}

/** List articles, optionally filtered by status and/or lang. */
export async function listArticles(
  db: AnyPgDatabase,
  opts: { status?: Status; lang?: string; limit?: number } = {},
): Promise<ArticleRow[]> {
  const conds = [];
  if (opts.status) conds.push(eq(articles.status, opts.status));
  if (opts.lang) conds.push(eq(articles.lang, opts.lang));
  return db
    .select()
    .from(articles)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(sql`coalesce(${articles.publishedAt}, ${articles.createdAt})`))
    .limit(opts.limit ?? 200);
}

export async function getArticleById(db: AnyPgDatabase, id: number): Promise<ArticleRow | null> {
  const [row] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return row ?? null;
}

export async function getArticleBySlug(
  db: AnyPgDatabase,
  slug: string,
  lang?: string,
): Promise<ArticleRow | null> {
  const conds = [eq(articles.slug, slug)];
  if (lang) conds.push(eq(articles.lang, lang));
  const [row] = await db
    .select()
    .from(articles)
    .where(and(...conds))
    .limit(1);
  return row ?? null;
}

/** Count of articles awaiting review (for the morning digest + admin badge). */
export async function countPending(db: AnyPgDatabase, lang?: string): Promise<number> {
  const conds = [eq(articles.status, "pending")];
  if (lang) conds.push(eq(articles.lang, lang));
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(articles)
    .where(and(...conds));
  return r?.n ?? 0;
}

export interface ArticlePatchDTO {
  status?: Status;
  reviewerNote?: string | null;
  title?: string;
  excerpt?: string;
  topic?: string;
  bodyMd?: string;
  takeaways?: string[] | null;
  coverImage?: string | null;
}

/**
 * Update an article. The admin review buttons send {status:'published'} (approve,
 * stamps publishedAt) or {status:'rejected', reviewerNote} (return for rework).
 * Editing fields is also supported (admin inline fixes before approval).
 */
export async function updateArticle(
  db: AnyPgDatabase,
  id: number,
  patch: ArticlePatchDTO,
): Promise<ArticleRow | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status && STATUSES.includes(patch.status)) {
    set.status = patch.status;
    if (patch.status === "published") set.publishedAt = new Date();
    if (patch.status !== "rejected") set.reviewerNote = null;
  }
  if (patch.reviewerNote !== undefined) set.reviewerNote = patch.reviewerNote;
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.excerpt !== undefined) set.excerpt = patch.excerpt;
  if (patch.topic !== undefined) set.topic = patch.topic;
  if (patch.bodyMd !== undefined) {
    set.bodyMd = patch.bodyMd;
    set.readMins = estimateReadMins(patch.bodyMd);
  }
  if (patch.takeaways !== undefined) set.takeaways = patch.takeaways;
  if (patch.coverImage !== undefined) set.coverImage = patch.coverImage;

  const [row] = await db.update(articles).set(set).where(eq(articles.id, id)).returning();
  return row ?? null;
}

export async function deleteArticle(db: AnyPgDatabase, id: number): Promise<boolean> {
  const res = await db.delete(articles).where(eq(articles.id, id)).returning({ id: articles.id });
  return res.length > 0;
}

export type { ArticleRow };
export { STATUSES, inArray };
