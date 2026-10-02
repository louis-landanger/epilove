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

/** Signs up and completes the whole onboarding; ends on the app home. */
export async function onboardMember(page: Page, firstName = "Camille") {
  await startOnboarding(page, "2004-05-17", firstName);
  await page.getByRole("button", { name: "Une femme" }).click();
  await continueStep(page);
  await page.getByRole("button", { name: /^Amis/ }).click();
  await continueStep(page);
  await expect(page.getByRole("heading", { name: "Qui veux-tu voir ?" })).toBeVisible();
  await continueStep(page);
  await expect(page.getByRole("heading", { name: "Tes photos" })).toBeVisible();
  await pickGeneratedPhoto(page, 30);
  await expect(page.getByRole("listitem").filter({ hasText: /Traitement|En vérification/ })).toHaveCount(1);
  await pickGeneratedPhoto(page, 260);
  await expect(page.getByRole("listitem").filter({ hasText: /Traitement|En vérification/ })).toHaveCount(2);
  await continueStep(page);
  await expect(page.getByRole("heading", { name: "Trois prompts" })).toBeVisible();
  for (const answer of ["Réponse une.", "Réponse deux.", "Réponse trois."]) {
    await page.getByRole("button", { name: "Choisir un prompt" }).first().click();
    const picker = page.getByRole("dialog", { name: "Choisis un prompt" });
    await picker.locator("li button").first().click();
    await expect(picker).toBeHidden();
    await page.locator("ol textarea").last().fill(answer);
  }
  await continueStep(page);
  await expect(page.getByRole("heading", { name: "Tes centres d'intérêt" })).toBeVisible();
  for (let index = 0; index < 3; index += 1) {
    await page.locator("section ul button").nth(index).click();
  }
  await continueStep(page);
  await page.getByRole("button", { name: "2028" }).click();
  await page.getByRole("checkbox", { name: "J'étudie sur le campus de Lyon." }).click();
  await page.getByRole("checkbox", { name: /Je suis étudiant·e/ }).click();
  await continueStep(page);
  await page.getByRole("button", { name: "Activer mon profil" }).click();
  await page.getByRole("button", { name: "Plus tard" }).click();
  await page.waitForURL("**/decouvrir");
}
