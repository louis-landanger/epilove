import { expect, test } from "@playwright/test";
import { signUp } from "./support/auth";
import { onboardMember } from "./support/onboarding";

// Chromium's fake microphone: a steady beep instead of a real device.
const executablePath = process.env.PW_CHROMIUM_PATH;
test.use({
  permissions: ["microphone"],
  launchOptions: {
    ...(executablePath ? { executablePath } : {}),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
});

test.describe("voice prompts (PRO-06)", () => {
  test.describe.configure({ timeout: 150_000 });

  test("records a voice answer, plays it through a signed URL and removes it", async ({ page }) => {
    await signUp(page, "isg.fr");
    await onboardMember(page, "Lou");

    await page.goto("/profil");
    await page.getByRole("tab", { name: "Modifier" }).click();
    await page.getByRole("button", { name: "Ajouter un vocal" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Ta réponse en vocal" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog.getByText(/Enregistrement\s:\s\d+ s sur 30/)).toBeVisible();
    await page.waitForTimeout(2200);
    await dialog.getByRole("button", { name: "Arrêter" }).click();
    await expect(dialog.getByRole("button", { name: "Écouter la réponse vocale" })).toBeVisible();
    await dialog.getByRole("button", { name: "Utiliser ce vocal" }).click();
    await expect(dialog).toBeHidden();

    // Checked by the worker, then playable.
    const player = page.getByRole("button", { name: "Écouter la réponse vocale" }).first();
    await expect(player).toBeVisible({ timeout: 20_000 });
    const audio = page.waitForResponse((response) => response.url().includes("/api/voice/"));
    await player.click();
    expect([200, 206]).toContain((await audio).status());

    await page.getByRole("tab", { name: "Aperçu" }).click();
    await expect(page.getByText("Transcription")).toBeVisible();

    await page.getByRole("tab", { name: "Modifier" }).click();
    await page.getByRole("button", { name: "Supprimer le vocal" }).click();
    await expect(page.getByRole("button", { name: "Écouter la réponse vocale" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ajouter un vocal" })).toHaveCount(3);
  });
});
