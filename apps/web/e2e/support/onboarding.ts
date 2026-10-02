import { expect, type Page } from "@playwright/test";

/** Generates a JPEG in the page and feeds it to the photo input, as a file picker would. */
export async function pickGeneratedPhoto(page: Page, hue: number) {
  await page.locator('input[type="file"]').waitFor({ state: "attached" });
  await page.evaluate(async (h) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    const gradient = context.createLinearGradient(0, 0, 900, 1200);
    gradient.addColorStop(0, `hsl(${h} 80% 60%)`);
    gradient.addColorStop(1, `hsl(${(h + 120) % 360} 70% 30%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 900, 1200);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("toBlob"))), "image/jpeg", 0.9),
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("no file input");
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], `photo-${h}.jpg`, { type: "image/jpeg" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, hue);
  const dialog = page.getByRole("dialog", { name: "Cadre ta photo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Utiliser cette photo" }).click();
  await expect(dialog).toBeHidden();
}

export async function continueStep(page: Page) {
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
}

/** Charter, first name and date of birth. */
export async function startOnboarding(page: Page, birthDate: string, firstName = "Camille") {
  await expect(page.getByRole("heading", { name: "Respect, toujours." })).toBeVisible();
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByRole("heading", { name: "Le consentement d'abord." })).toBeVisible();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "J'accepte la charte" }).click();

  await expect(page.getByRole("heading", { name: "Comment tu t'appelles ?" })).toBeVisible();
  await page.getByLabel("Prénom").fill(firstName);
  await continueStep(page);

  await expect(page.getByRole("heading", { name: "Ta date de naissance" })).toBeVisible();
  await page.getByLabel("Date de naissance").fill(birthDate);
  await continueStep(page);
  await page.getByRole("button", { name: "Oui, c'est ça" }).click();
}
