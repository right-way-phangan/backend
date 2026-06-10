/**
 * Create / update a CRM user.
 *   npm run create-user -- <email> <password> [role]   # role: admin|agent (default agent)
 * Local: PGLITE_DIR=./.pgdata is set by the npm script.
 */
import { createDb } from "../db/connect";
import { createUser } from "../lib/auth";

async function main() {
  const [email, password, role] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npm run create-user -- <email> <password> [role]");
    process.exit(1);
  }
  const { db, applyMigrations, closeDb } = await createDb();
  await applyMigrations();
  const u = await createUser(db, { email, password, role, name: email.split("@")[0] });
  console.log(`✓ user: ${u.email} (role=${u.role}, id=${u.id})`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
