import { parseSchoolEmail } from "@epilove/core";
import { eq } from "drizzle-orm";
import { createDatabase, databaseUrlFromEnv } from "./client";
import { appUser, ROLES, type Role } from "./schema/users";

/**
 * Gives a role to an existing account: `pnpm db:promote prenom.nom@epita.fr moderator`.
 * The person must have signed up on the app first (staff are members too).
 */
const [email = "", role = ""] = process.argv.slice(2);
const parsed = parseSchoolEmail(email);
if (!parsed.ok || !(ROLES as readonly string[]).includes(role)) {
  console.error(`Usage: pnpm db:promote <school email> <${ROLES.join("|")}>`);
  process.exit(1);
}

const { db, close } = createDatabase(databaseUrlFromEnv(), { maxConnections: 1 });
try {
  const updated = await db
    .update(appUser)
    .set({ role: role as Role })
    .where(eq(appUser.email, parsed.canonicalEmail))
    .returning({ id: appUser.id });
  console.log(updated.length > 0 ? `Role ${role} granted.` : "No account with this address.");
} finally {
  await close();
}
