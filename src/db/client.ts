/**
 * Drizzle client over postgres-js. Reads DATABASE_URL from env.
 *
 * In production the API runs ON the VPS next to Postgres, so DATABASE_URL points
 * at localhost — the DB is never exposed to the internet. Locally it points at a
 * Docker/Homebrew Postgres for development before the VPS exists.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set (see backend/.env.example)");
}

// max:1 is fine for scripts/migrations; the API can raise it.
export const queryClient = postgres(url, { max: Number(process.env.PG_POOL_MAX ?? 10) });
export const db = drizzle(queryClient, { schema });

/** Driver-agnostic shutdown (mirrors the PGlite local path). */
export async function closeDb(): Promise<void> {
  await queryClient.end();
}

export { schema };
