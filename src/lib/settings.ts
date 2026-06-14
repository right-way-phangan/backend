/**
 * App settings — a tiny key-value store (app_settings table) for config the
 * agent edits from /admin without a redeploy. First consumer: the monthly
 * commission target for «темп месяца» on the CRM dashboards.
 */
import { eq } from "drizzle-orm";
import { appSettings } from "../db/schema";
import type { AnyPgDatabase } from "./load";

export async function getSetting(db: AnyPgDatabase, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key));
  return row?.value ?? null;
}

export async function listSettings(db: AnyPgDatabase): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Upsert a setting; empty/null value deletes the row (clears the setting). */
export async function setSetting(
  db: AnyPgDatabase,
  key: string,
  value: string | null,
): Promise<void> {
  if (value == null || value === "") {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}
