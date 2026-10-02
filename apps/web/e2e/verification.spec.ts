import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signUp } from "./support/auth";
import { onboardMember } from "./support/onboarding";

// Chromium's fake camera: a moving test pattern instead of a real device.
const executablePath = process.env.PW_CHROMIUM_PATH;
test.use({
  permissions: ["camera"],
  launchOptions: {
    ...(executablePath ? { executablePath } : {}),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
});

test.describe("photo verification by gesture (ONB-08)", () => {
  test.describe.configure({ timeout: 150_000 });

  test("draws a gesture, takes a selfie with the camera and sends it for review", async ({ page }) => {
    await signUp(page, "ipsa.fr");
    await onboardMember(page, "Nour");

    await page.goto("/profil");
    await page.getByRole("link", { name: /Vérifier ma photo/ }).click();
    await expect(page.getByRole("heading", { name: "Prouve que c'est bien toi", level: 1 })).toBeVisible();
    await expect(page.getByText("Il est supprimé dès que la décision est prise.")).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze())
        .violations,
    ).toEqual([]);

    await page.getByRole("button", { name: "Tirer mon geste" }).click();
    await expect(page.getByRole("heading", { name: "Ton geste" })).toBeVisible();
    await expect(page.getByText(/À photographier avant/)).toBeVisible();

    await page.getByRole("button", { name: "Ouvrir la caméra" }).click();
    await expect(page.getByLabel("Aperçu de la caméra")).toBeVisible();
    await expect
      .poll(() =>
        page.getByLabel("Aperçu de la caméra").evaluate((video: HTMLVideoElement) => video.videoWidth),
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Prendre la photo", exact: true }).click();
    await expect(page.getByRole("img", { name: "Ton selfie, avant envoi" })).toBeVisible();
    await page.getByRole("button", { name: "Envoyer pour vérification" }).click();
    await expect(page.getByText("C'est envoyé")).toBeVisible();

    // One attempt in review at a time.
    await page.reload();
    await expect(page.getByText("C'est envoyé")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tirer mon geste" })).toHaveCount(0);
  });
});
