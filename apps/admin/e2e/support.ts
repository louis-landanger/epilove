import { uuidv7 } from "@atomes/core";
import { encryptText, keyRingFromEnv } from "@atomes/crypto";
import { createDatabase, databaseUrlFromEnv, schema } from "@atomes/db";
import { createStorage, storageConfigFromEnv } from "@atomes/media/storage";
import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import sharp from "sharp";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

export const db = createDatabase(databaseUrlFromEnv(), { maxConnections: 2 });

async function latestCode(to: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const body = (await response.json()) as { messages: Array<{ Subject: string }> };
    const match = body.messages[0]?.Subject.match(/^(\d{3}) (\d{3})/);
    if (match) {
      return `${match[1]}${match[2]}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in code received for ${to}`);
}

export async function createMember(role: "user" | "moderator" | "admin" = "user") {
  const [school] = await db.db
    .select({ id: schema.school.id })
    .from(schema.school)
    .where(eq(schema.school.slug, "epita"));
  const id = uuidv7();
  const email = `staff-e2e.${id}@epita.fr`;
  await db.db.insert(schema.appUser).values({
    id,
    schoolId: school?.id ?? "",
    email,
    emailHmac: `e2e-${id}`,
    emailVerified: true,
    role,
    status: "active",
  });
  await db.db.insert(schema.profile).values({
    userId: id,
    firstName: "Sacha",
    birthDate: "2002-03-04",
    gender: "nonbinary",
    graduationYear: 2027,
  });
  return { id, email };
}

/** A processed photo waiting for moderation, really stored so imgproxy can serve it. */
export async function createPendingPhoto(userId: string) {
  const id = uuidv7();
  const key = `photos/${userId}/${id}.webp`;
  const bytes = await sharp({ create: { width: 600, height: 750, channels: 3, background: "#7a3cff" } })
    .webp()
    .toBuffer();
  const storage = createStorage(storageConfigFromEnv());
  await storage.ensureBucket([]);
  await storage.write(key, new Uint8Array(bytes), "image/webp");
  await db.db
    .insert(schema.photo)
    .values({ id, userId, storageKey: key, position: 0, stage: "ready", width: 600, height: 750 });
  return id;
}

/** A gesture selfie waiting for review (ONB-08), really stored. Returns its storage key. */
export async function createPendingVerification(userId: string) {
  const id = uuidv7();
  const key = `verifications/${userId}/${id}.webp`;
  const bytes = await sharp({ create: { width: 600, height: 750, channels: 3, background: "#22aa88" } })
    .webp()
    .toBuffer();
  const storage = createStorage(storageConfigFromEnv());
  await storage.ensureBucket([]);
  await storage.write(key, new Uint8Array(bytes), "image/webp");
  await db.db
    .insert(schema.photoVerification)
    .values({ id, userId, gesture: "thumbs_up", status: "pending", storageKey: key });
  return { id, key, storage };
}

export async function createReport(reporterId: string, reportedId: string) {
  const details = encryptText(keyRingFromEnv(), "Insultes répétées dans nos messages.");
  const [row] = await db.db
    .insert(schema.report)
    .values({
      reporterId,
      reportedId,
      context: "message",
      contextRef: "e2e-message",
      reason: "harassment",
      priority: "p2",
      detailsEncrypted: details.data,
      keyId: details.keyId,
    })
    .returning({ id: schema.report.id });
  return row?.id ?? "";
}

export async function signInStaff(page: Page, email: string) {
  const part = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${part()}.${part()}.${part()}` });
  await page.goto("/connexion");
  await page.getByLabel("Email d'école").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  await expect(page.getByText(`Code envoyé à ${email}.`)).toBeVisible();
  const code = await latestCode(email);
  await page.getByRole("textbox").first().click();
  await page.keyboard.type(code);
}
