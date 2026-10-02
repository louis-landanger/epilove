import { expect, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

export async function latestCode(to: string): Promise<string> {
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

export async function signUp(page: Page, school = "epita.fr"): Promise<string> {
  const email = `e2e.${Date.now()}.${Math.floor(Math.random() * 1e6)}@${school}`;
  await page.goto("/connexion");
  await page.getByLabel("Email d'école").fill(email);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByRole("heading", { name: "Vérifie tes emails." })).toBeVisible();
  const code = await latestCode(email);
  await page.getByRole("textbox").first().click();
  await page.keyboard.type(code);
  await page.waitForURL("**/onboarding");
  return email;
}
