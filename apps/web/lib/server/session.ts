import "server-only";
import { DEV_USER_COOKIE } from "@epilove/api";
import type { AccountStatus } from "@epilove/core";
import { UUID_PATTERN } from "@epilove/core";
import { type Role, schema } from "@epilove/db";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";
import { getDatabase } from "./database";

export interface CurrentMember {
  readonly userId: string;
  readonly role: Role;
  readonly status: AccountStatus;
  readonly email: string;
  readonly schoolId: string;
}

function devAuthAllowed() {
  return (
    process.env.DEV_AUTH === "1" && (process.env.APP_ENV === "development" || process.env.APP_ENV === "test")
  );
}

/** The signed-in member for this request (React cache: one lookup per render). */
export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  let userId = session?.user.id;
  if (!userId && devAuthAllowed()) {
    const devId = (await cookies()).get(DEV_USER_COOKIE)?.value;
    userId = devId && UUID_PATTERN.test(devId) ? devId : undefined;
  }
  if (!userId) {
    return null;
  }
  const [member] = await getDatabase()
    .select({
      userId: schema.appUser.id,
      role: schema.appUser.role,
      status: schema.appUser.status,
      email: schema.appUser.email,
      schoolId: schema.appUser.schoolId,
    })
    .from(schema.appUser)
    .where(eq(schema.appUser.id, userId))
    .limit(1);
  return member ?? null;
});

/** Any signed-in member, whatever their status. */
export async function requireMember(): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/connexion");
  }
  return member;
}

/** A member allowed inside the app; sends everyone else to the right place. */
export async function requireAppMember(): Promise<CurrentMember> {
  const member = await requireMember();
  switch (member.status) {
    case "onboarding":
      redirect("/onboarding");
      break;
    case "suspended":
    case "banned":
      redirect("/compte/suspendu");
      break;
    case "deleting":
      redirect("/compte/supprime");
      break;
    default:
      break;
  }
  return member;
}
