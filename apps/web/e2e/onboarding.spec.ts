import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { signUp } from "./support/auth";
import { continueStep, pickGeneratedPhoto, startOnboarding } from "./support/onboarding";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

/** Each step fades in (onboarding-flow.tsx): colours are only measured once it is fully opaque. */
async function expectFadedIn(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        let opacity = 1;
        for (let node: Element | null = element; node; node = node.parentElement) {
          opacity *= Number(getComputedStyle(node).opacity);
        }
        return opacity;
      }),
    )
    .toBe(1);
}

test.describe("onboarding", () => {
  test.describe.configure({ timeout: 120_000 });

  test("a new member completes every step and lands in the app", async ({ page }) => {
    await signUp(page, "supbiotech.fr");
    await expectAccessible(page);
    await startOnboarding(page, "2004-05-17");

    await expect(page.getByRole("heading", { name: "Tu es…" })).toBeVisible();
    await page.getByRole("button", { name: "Une femme" }).click();
    await page.getByLabel("Pronoms (facultatif)").fill("elle");
    await continueStep(page);

    await expect(page.getByRole("heading", { name: "Tu cherches quoi ?" })).toBeVisible();
    await page.getByRole("button", { name: /Les deux/ }).click();
    await page.getByRole("button", { name: "Relation sérieuse" }).click();
    await continueStep(page);

    // Separate, explicit consent: not pre-ticked, Continue disabled without it.
    await expect(page.getByRole("heading", { name: "Qui veux-tu voir ?" })).toBeVisible();
    const consent = page.getByRole("checkbox", { name: /donnée sensible/ });
    await expect(consent).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Continuer", exact: true })).toBeDisabled();
    await expectAccessible(page);
    await consent.click();
    await page.getByRole("button", { name: "Des hommes" }).click();
    await continueStep(page);

    // Resumes at the right step after a reload.
    await expect(page.getByRole("heading", { name: "Tes photos" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Tes photos" })).toBeVisible();

    await pickGeneratedPhoto(page, 330);
    await expect(page.getByRole("listitem").filter({ hasText: /Traitement|En vérification/ })).toHaveCount(1);
    await pickGeneratedPhoto(page, 200);
    await expect(page.getByRole("listitem").filter({ hasText: /Traitement|En vérification/ })).toHaveCount(2);
    await expectAccessible(page);
    await continueStep(page);

    await expect(page.getByRole("heading", { name: "Trois prompts" })).toBeVisible();
    for (const answer of [
      "Le toit de l'IPSA au coucher du soleil.",
      "Un TP de chimie à 8 h.",
      "Les pâtes au pesto.",
    ]) {
      await page.getByRole("button", { name: "Choisir un prompt" }).first().click();
      const picker = page.getByRole("dialog", { name: "Choisis un prompt" });
      await picker.locator("li button").first().click();
      await expect(picker).toBeHidden();
      // The answer field is labelled by its prompt.
      await page.locator("ol textarea").last().fill(answer);
    }
    await continueStep(page);

    await expect(page.getByRole("heading", { name: "Tes centres d'intérêt" })).toBeVisible();
    const chips = page.locator("section ul button");
    for (let index = 0; index < 3; index += 1) {
      await chips.nth(index).click();
    }
    await continueStep(page);

    await expect(page.getByRole("heading", { name: "Ton campus et ta promo" })).toBeVisible();
    await page.getByRole("button", { name: "2028" }).click();
    await page.getByRole("checkbox", { name: "J'étudie sur le campus de Lyon." }).click();
    await page.getByRole("checkbox", { name: /Je suis étudiant·e/ }).click();
    await continueStep(page);

    await expect(page.getByRole("heading", { name: "Tout est prêt, Camille." })).toBeVisible();
    await expectFadedIn(page.getByRole("button", { name: "Activer mon profil" }));
    await expectAccessible(page);
    await page.getByRole("button", { name: "Activer mon profil" }).click();
    await page.getByRole("button", { name: "Plus tard" }).click();
    await page.waitForURL("**/decouvrir");

    // Onboarding is closed once the profile is active.
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/decouvrir$/);
  });

  test("refusing the sensitive-data consent keeps Friends mode only", async ({ page }) => {
    await signUp(page, "isg.fr");
    await startOnboarding(page, "2003-11-02", "Sasha");
    await page.getByRole("button", { name: "Une personne non binaire" }).click();
    await continueStep(page);
    await page.getByRole("button", { name: /^Love/ }).click();
    await continueStep(page);
    await page.getByRole("button", { name: "Continuer en mode Amis uniquement" }).click();
    await expect(page.getByRole("heading", { name: "Tes photos" })).toBeVisible();
    await page.getByRole("button", { name: "Retour" }).click();
    await expect(page.getByText("En mode Amis, tout le monde peut te croiser.")).toBeVisible();
  });

  test("a minor is turned away and cannot sign up again", async ({ page }) => {
    const email = await signUp(page, "esme.fr");
    await startOnboarding(page, "2011-06-01", "Léo");
    await page.waitForURL("**/compte/mineur");
    await expect(page.getByRole("heading", { name: "Reviens à tes 18 ans." })).toBeVisible();

    await page.goto("/connexion");
    await page.getByLabel("Email d'école").fill(email);
    await page.getByRole("button", { name: "Recevoir mon code" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "ne peut pas être utilisée" })).toBeVisible();
  });
});
