import { createHmac, timingSafeEqual } from "node:crypto";
import type { Database } from "@atomes/db";
import { schema } from "@atomes/db";
import { asc, gt } from "drizzle-orm";

/** Crockford base32 without ambiguous letters: easy to read back from a screenshot. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const WATERMARK_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/**
 * The code tiled over the photos a member looks at (SAF-12): "7KQ2-XA9M".
 * Derived with a secret and a context of its own, so it reveals neither the
 * account nor the moderation pseudonym.
 */
export function watermarkCode(secret: string, userId: string): string {
  const digest = createHmac("sha256", secret).update(`watermark:${userId}`).digest();
  let value = "";
  for (let index = 0; index < 8; index += 1) {
    value += ALPHABET[(digest[index] ?? 0) % ALPHABET.length];
  }
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

export function normalizeWatermark(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, "").replaceAll("O", "0").replace(/[IL]/g, "1");
  const code = `${compact.slice(0, 4)}-${compact.slice(4)}`;
  return compact.length === 8 && WATERMARK_PATTERN.test(code) ? code : null;
}

/**
 * Finds whose screen a code comes from, by recomputing every member's code:
 * a few thousand HMACs, no stored mapping to leak.
 */
export async function findWatermarkOwner(db: Database, secret: string, code: string): Promise<string | null> {
  const wanted = Buffer.from(code);
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const rows = await db
      .select({ id: schema.appUser.id })
      .from(schema.appUser)
      .where(gt(schema.appUser.id, after))
      .orderBy(asc(schema.appUser.id))
      .limit(2000);
    for (const { id } of rows) {
      const candidate = Buffer.from(watermarkCode(secret, id));
      if (candidate.length === wanted.length && timingSafeEqual(candidate, wanted)) {
        return id;
      }
    }
    const last = rows.at(-1);
    if (!last || rows.length < 2000) {
      return null;
    }
    after = last.id;
  }
}
