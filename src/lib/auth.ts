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
}

export const ROLES = ["admin", "agent", "partner"] as const;

/** Create or update a user (idempotent by email). */
export async function createUser(
  db: AnyPgDatabase,
  input: { email: string; password: string; name?: string; role?: string; developer?: string },
): Promise<AuthUser> {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const email = input.email.trim().toLowerCase();
  const role = input.role || "agent";
  if (!(ROLES as readonly string[]).includes(role)) throw new Error(`role must be one of ${ROLES.join("|")}`);
  const developer = input.developer?.trim().toLowerCase() || null;
  if (role === "partner" && !developer) throw new Error("role=partner requires a developer");
  if (role !== "partner" && developer) throw new Error("developer is only valid for role=partner");
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash, name: input.name, role, developer })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash, name: input.name, role, developer },
    })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role, developer: users.developer });
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
  return { id: u.id, email: u.email, name: u.name, role: u.role, developer: u.developer };
}
