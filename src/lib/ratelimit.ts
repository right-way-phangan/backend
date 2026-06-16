/**
 * Postgres fixed-window rate limiter (Phase B hardening).
 *
 * Why Postgres and not in-memory: the API runs serverless on Vercel, where each
 * cold instance has its own RAM — an in-memory Map would not see a flood spread
 * across instances. Why not Vercel KV / Upstash: bootstrap rule — no new paid
 * service before the first deal; we already run Neon Postgres.
 *
 * Fixed window: the timeline is cut into windowSec-long buckets; one row per
 * (key, bucket) is incremented atomically by an upsert. Simpler than a sliding
 * window and good enough to blunt form spam and login brute-force.
 */
import { sql } from "drizzle-orm";
import { lt } from "drizzle-orm";
import { rateLimits } from "../db/schema";
import type { AnyPgDatabase } from "./load";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  resetAt: string; // ISO — когда окно обнулится
}

/**
 * Counts one hit against `key` and reports whether it is still within `limit`
 * per `windowSec`. Atomic: a single INSERT … ON CONFLICT DO UPDATE.
 */
export async function checkRateLimit(
  db: AnyPgDatabase,
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  const count = row?.count ?? 1;

  // Opportunistic sweep (~1% of calls): drop windows older than a day so the
  // table can't grow unbounded. Best-effort — never block the caller on it.
  if (Math.random() < 0.01) {
    const cutoff = new Date(now - 24 * 60 * 60 * 1000);
    db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff)).catch(() => {});
  }

  return {
    allowed: count <= limit,
    count,
    resetAt: new Date(windowStart.getTime() + windowMs).toISOString(),
  };
}
