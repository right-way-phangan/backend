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
}

/** Create or update a user (idempotent by email). */
export async function createUser(
  db: AnyPgDatabase,
  input: { email: string; password: string; name?: string; role?: string },
): Promise<AuthUser> {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const email = input.email.trim().toLowerCase();
  const role = input.role || "agent";
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash, name: input.name, role })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash, name: input.name, role },
    })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
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
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
