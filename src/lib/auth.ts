/**
 * CRM auth (Phase B) — user creation + credential check. The web app calls
 * POST /auth/login and, on success, issues its own signed session cookie.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import type { AnyPgDatabase } from "./load";

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  /** partner only: developer slug whose leads (tag developer:<slug>) the user may see */
  developer: string | null;
  /** /admin UI language: ru | en | th (null → ru) */
  lang: string | null;
}

const PUBLIC_COLS = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  developer: users.developer,
  lang: users.lang,
};

export const ROLES = ["admin", "agent", "partner"] as const;
export const UI_LANGS = ["ru", "en", "th"] as const;

/** Create or update a user (idempotent by email). */
export async function createUser(
  db: AnyPgDatabase,
  input: { email: string; password: string; name?: string; role?: string; developer?: string; lang?: string },
): Promise<AuthUser> {
  if (!input.email?.includes("@")) throw new Error("valid email required");
  if (!input.password || input.password.length < 8) throw new Error("password must be at least 8 characters");
  const lang = input.lang && (UI_LANGS as readonly string[]).includes(input.lang) ? input.lang : null;
  const passwordHash = await bcrypt.hash(input.password, 10);
  const email = input.email.trim().toLowerCase();
  const role = input.role || "agent";
  if (!(ROLES as readonly string[]).includes(role)) throw new Error(`role must be one of ${ROLES.join("|")}`);
  const developer = input.developer?.trim().toLowerCase() || null;
  if (role === "partner" && !developer) throw new Error("role=partner requires a developer");
  if (role !== "partner" && developer) throw new Error("developer is only valid for role=partner");
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash, name: input.name, role, developer, lang })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash, name: input.name, role, developer, lang },
    })
    .returning(PUBLIC_COLS);
  return u;
}

/** Verify email+password. Returns the user (no hash) or null. */
export async function verifyLogin(
  db: AnyPgDatabase,
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  if (!u) return null;
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, developer: u.developer, lang: u.lang };
}

/** Users without password hashes — /admin/users. */
export async function listUsers(db: AnyPgDatabase): Promise<(AuthUser & { createdAt: Date })[]> {
  return db.select({ ...PUBLIC_COLS, createdAt: users.createdAt }).from(users).orderBy(users.id);
}

/** Change UI language (or name) without touching the password. */
export async function updateUser(
  db: AnyPgDatabase,
  id: number,
  patch: { lang?: string | null; name?: string },
): Promise<AuthUser | null> {
  const set: Record<string, unknown> = {};
  if ("lang" in patch) set.lang = patch.lang && (UI_LANGS as readonly string[]).includes(patch.lang) ? patch.lang : null;
  if (typeof patch.name === "string") set.name = patch.name.trim() || null;
  if (!Object.keys(set).length) return null;
  const [u] = await db.update(users).set(set).where(eq(users.id, id)).returning(PUBLIC_COLS);
  return u ?? null;
}

/** Remove access. Last admin can't be deleted (would lock everyone out). */
export async function deleteUser(db: AnyPgDatabase, id: number): Promise<boolean> {
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  if (!u) return false;
  if (u.role === "admin") {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    if (admins.length <= 1) throw new Error("cannot delete the last admin");
  }
  await db.delete(users).where(eq(users.id, id));
  return true;
}
