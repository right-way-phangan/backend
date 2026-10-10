/**
 * Create / update a CRM user.
 *   npm run create-user -- <email> <password> [role] [--developer <slug>]
 *   role: admin|agent|partner (default agent); partner requires --developer (e.g. arqa-development)
 * Local: PGLITE_DIR=./.pgdata is set by the npm script.
 */
import { createDb } from "../db/connect";
import { createUser } from "../lib/auth";

async function main() {
  const args = process.argv.slice(2);
  const di = args.indexOf("--developer");
  const developer = di >= 0 ? args.splice(di, 2)[1] : undefined;
  const [email, password, role] = args;
  if (!email || !password) {
    console.error("Usage: npm run create-user -- <email> <password> [role] [--developer <slug>]");
    process.exit(1);
  }
  const { db, applyMigrations, closeDb } = await createDb();
  await applyMigrations();
  const u = await createUser(db, { email, password, role, developer, name: email.split("@")[0] });
  console.log(`✓ user: ${u.email} (role=${u.role}${u.developer ? `, developer=${u.developer}` : ""}, id=${u.id})`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
