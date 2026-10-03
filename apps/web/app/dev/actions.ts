"use server";

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DEV_MEMBER_COOKIE, isDevEnvironment, parseDevMember } from "@/lib/rencontre/dev-member";

/** Development only: signs in as a seeded member by setting the dev cookie. */
export async function chooseDevMember(formData: FormData) {
  if (!isDevEnvironment()) {
    notFound();
  }
  const id = parseDevMember(String(formData.get("memberId") ?? ""));
  const jar = await cookies();
  if (id) {
    jar.set(DEV_MEMBER_COOKIE, id, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    jar.delete(DEV_MEMBER_COOKIE);
  }
}
