import { normalizePromptAnswer, PROGRAM_MAX_LENGTH } from "@atomes/core";
import type { Database } from "@atomes/db";
import { countActivePrompts, countInterests } from "@atomes/db/repositories/profiles";

type Db = Pick<Database, "select" | "insert" | "update" | "delete">;

/** A field that failed validation; procedures turn it into their `INVALID_VALUE` error. */
export class InvalidValue extends Error {
  constructor(readonly field: string) {
    super(`Invalid ${field}`);
  }
}

/** Three different active prompts, each answered in 1 to 200 characters (PRO-02). */
export async function checkedPromptAnswers(db: Db, answers: readonly { promptId: string; text: string }[]) {
  const ids = answers.map((answer) => answer.promptId);
  if (new Set(ids).size !== ids.length) {
    throw new InvalidValue("promptId");
  }
  const checked = answers.map((answer, index) => {
    const text = normalizePromptAnswer(answer.text);
    if (!text) {
      throw new InvalidValue(`answers.${index}`);
    }
    return { promptId: answer.promptId, text };
  });
  if ((await countActivePrompts(db, ids)) !== ids.length) {
    throw new InvalidValue("promptId");
  }
  return checked;
}

/** Distinct interests from the closed catalogue (PRO-04). */
export async function checkedInterests(db: Db, interestIds: readonly string[]) {
  const ids = [...new Set(interestIds)];
  if (ids.length !== interestIds.length || (await countInterests(db, ids)) !== ids.length) {
    throw new InvalidValue("interestIds");
  }
  return ids;
}

/** Optional free-text programme ("Cycle ingénieur", "MSc"…), spaces collapsed. */
export function checkedProgram(input: string | null | undefined): string | null {
  const program = input?.replaceAll(/\s+/g, " ").trim() || null;
  if (program && program.length > PROGRAM_MAX_LENGTH) {
    throw new InvalidValue("program");
  }
  return program;
}
