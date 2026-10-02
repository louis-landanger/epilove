import { createDatabase, databaseUrlFromEnv, schema } from "@epilove/db";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { latestCode, signUp } from "./support/auth";
import { onboardMember } from "./support/onboarding";

test.describe("yearly re-verification", () => {
  test.describe.configure({ timeout: 120_000 });
  const db = createDatabase(databaseUrlFromEnv(), { maxConnections: 1 });
  test.afterAll(() => db.close());

  test("a member confirms their school address from the banner", async ({ page }) => {
    const email = await signUp(page, "epita.fr");
    await onboardMember(page, "Yanis");
    const soon = new Date(Date.now() + 10 * 86_400_000);
    await db.db.update(schema.appUser).set({ reverifyDueAt: soon }).where(eq(schema.appUser.email, email));

    await page.goto("/profil");
    const banner = page.getByRole("status").filter({ hasText: "confirme ton adresse d'école" });
    await expect(banner).toBeVisible();
    await banner.getByRole("link", { name: "Confirmer" }).click();
    await expect(page.getByRole("heading", { name: "Toujours sur le campus ?" })).toBeVisible();
    await page.getByRole("button", { name: "Recevoir le code" }).click();
    await expect(page.getByRole("textbox").first()).toBeVisible();
    // Wait for the new code: the previous one was used at sign-up.
    await page.waitForTimeout(1000);
    const code = await latestCode(email);
    await page.getByRole("textbox").first().click();
    await page.keyboard.type(code);
    await expect(page.getByText("C'est confirmé, merci !")).toBeVisible();

    const [account] = await db.db
      .select({ due: schema.appUser.reverifyDueAt })
      .from(schema.appUser)
      .where(eq(schema.appUser.email, email));
    expect((account?.due?.getTime() ?? 0) > soon.getTime()).toBe(true);
  });
});
