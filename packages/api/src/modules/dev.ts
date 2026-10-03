import { ageOn } from "@epilove/core";
import { campusDate, listMembersForDevPicker } from "@epilove/db/repositories/members";
import { ORPCError } from "@orpc/server";
import { os } from "../procedures";

/** Development tools only: invisible (NOT_FOUND) unless APP_ENV is development or test. */
const devOnly = os.middleware(async ({ next }) => {
  if (process.env.APP_ENV !== "development" && process.env.APP_ENV !== "test") {
    throw new ORPCError("NOT_FOUND");
  }
  return next();
});

export const dev = {
  members: os.dev.members.use(devOnly).handler(async ({ context }) => {
    const today = campusDate(new Date());
    const rows = await listMembersForDevPicker(context.database());
    return {
      members: rows.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        status: row.status,
        schoolSlug: row.schoolSlug,
        schoolName: row.schoolName,
        gender: row.gender,
        age: ageOn(row.birthDate, today),
        modes: row.modes.filter((mode): mode is "love" | "friends" => mode === "love" || mode === "friends"),
      })),
    };
  }),
};
