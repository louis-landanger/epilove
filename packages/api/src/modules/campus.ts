import { parseSchoolEmail } from "@epilove/core";
import { os } from "../procedures";

export const campus = {
  checkEmail: os.campus.checkEmail.handler(({ input }) => {
    const result = parseSchoolEmail(input.email);
    if (!result.ok) {
      return { eligible: false as const, reason: result.reason };
    }
    return {
      eligible: true as const,
      school: { slug: result.school.slug, name: result.school.name },
    };
  }),
};
