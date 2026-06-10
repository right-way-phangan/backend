/**
 * Single DB entry point — driver chosen by env:
 *   PGLITE_DIR set      → PGlite (local dev, no server). e.g. ./.pgdata
 *   else DATABASE_URL   → postgres-js (the VPS / any real Postgres)
 *
 * Returns the drizzle db plus closeDb() and applyMigrations() so the API and
 * scripts share one connection path. The API auto-applies migrations on boot,
 * which matters on the VPS (deploy = pull + restart, no manual migrate step).
 */
import "dotenv/config";
import * as schema from "./schema";
import type { AnyPgDatabase } from "../lib/load";

export interface Db {
  db: AnyPgDatabase;
  driver: "pglite" | "postgres";
  closeDb: () => Promise<void>;
  applyMigrations: () => Promise<void>;
}

export async function createDb(): Promise<Db> {
  const pgliteDir = process.env.PGLITE_DIR;
  if (pgliteDir) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite(pgliteDir);
    const db = drizzle(client, { schema });
    return {
      db,
      driver: "pglite",
      closeDb: async () => {
        await client.close();
      },
      applyMigrations: async () => {
        await migrate(db, { migrationsFolder: "./drizzle" });
      },
    };
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set PGLITE_DIR (local dev) or DATABASE_URL (Postgres).");
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: Number(process.env.PG_POOL_MAX ?? 10) });
  const db = drizzle(client, { schema });
  return {
    db,
    driver: "postgres",
    closeDb: async () => {
      await client.end();
    },
    applyMigrations: async () => {
      await migrate(db, { migrationsFolder: "./drizzle" });
    },
  };
}
