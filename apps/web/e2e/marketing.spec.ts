import { createHmac, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase, deleteWaitlistEntries } from "@atomes/db";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// The server reads the repository's `.env`; the clean-up below needs the same secrets.
const rootEnv = resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SCHOOLS = ["EPITA", "ESME", "Sup'Biotech", "ISG", "IPSA"];
const LEGAL_PAGES = [
  { path: "/legal/mentions-legales", title: "Mentions légales" },
  { path: "/legal/cgu", title: "Conditions générales d’utilisation" },
  { path: "/legal/confidentialite", title: "Politique de confidentialité" },
  { path: "/legal/transparence", title: "Transparence du classement" },
] as const;

const createdAddresses: string[] = [];

function freshAddress(domain: string): string {
  const address = `e2e.${randomUUID().slice(0, 12)}@${domain}`;
  createdAddresses.push(address);
  return address;
}

test.afterAll(async () => {
  const secret = process.env.EMAIL_HMAC_SECRET;
  const url = process.env.DATABASE_URL;
  if (!secret || !url || createdAddresses.length === 0) {
    return;
  }
  const { db, close } = createDatabase(url, { maxConnections: 1 });
  await deleteWaitlistEntries(
    db,
    createdAddresses.map((address) => createHmac("sha256", secret).update(address).digest("hex")),
  );
  await close();
});

/** Scrolls through the page so one-way scroll reveals have run, then back to the top. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.7);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((done) => setTimeout(done, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1600);
}

async function joinForm(page: Page) {
  const form = page.locator("#rejoindre");
  await form.scrollIntoViewIfNeeded();
  return {
    input: form.getByLabel("Ton email d’école"),
    submit: form.getByRole("button", { name: "Rejoindre la liste" }),
    form,
  };
}

test.describe("landing", () => {
  test("presents the headline, the call to action and the eligible schools", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Atomes");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveAccessibleName("Trouve tes atomes crochus.");
    await expect(page.getByRole("link", { name: "Rejoindre la liste" }).first()).toHaveAttribute(
      "href",
      "#rejoindre",
    );
    // The count only shows once the list is worth it (LIVE_COUNT_FROM sign-ups).
    const count = page.getByTestId("live-count");
    if (await count.isVisible()) {
      await expect(count).toContainText(/\d+ personnes déjà dans la liste/);
    }
    await expect(page.getByRole("list", { name: "Écoles concernées" }).getByRole("listitem")).toHaveText(
      SCHOOLS,
    );
  });

  test("shows two fictional profiles bonding, out of reach of assistive technologies", async ({ page }) => {
    await page.goto("/");
    const stage = page.locator("[data-field-profiles]");
    await expect(stage.locator("[data-profile-card]")).toHaveCount(2);
    await expect(stage.locator("[data-profile-card]").first()).toBeVisible();
    await expect(stage).toContainText("Liaison établie");
    await expect(stage).toContainText("Profils fictifs");
    // An illustration: inert, so neither focus nor screen readers land in it.
    await expect(stage).toHaveAttribute("inert", "");
  });

  test("tells the story section by section", async ({ page }) => {
    await page.goto("/");
    for (const name of [
      /Cinq écoles\. Une ville\. Zéro hasard/,
      "Trois étapes, zéro prise de tête.",
      /Quelle école a le plus/,
      /45 questions\. Un match\./,
      "Nos engagements",
      "Questions fréquentes",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeAttached();
    }
    await expect(page.getByRole("list").filter({ hasText: "Vérifie ton email d’école" })).toBeVisible();
    await expect(page.getByText("Jeudi 11 février 2027, 20 h")).toBeVisible();
    await expect(page.locator("time[datetime='2027-02-11T20:00:00+01:00']")).toBeAttached();
    await expect(
      page.getByRole("contentinfo").getByText("non affilié à IONIS Education Group"),
    ).toBeVisible();
  });

  test("ranks the school race in a real table, with the collective goal", async ({ page }) => {
    await page.goto("/");
    const table = page.getByRole("table", { name: /Classement de la course des écoles/ });
    await table.scrollIntoViewIfNeeded();
    await expect(table.getByRole("columnheader")).toHaveText([
      "Rang",
      "École",
      "Inscrits",
      "Part de l’effectif",
    ]);
    const rows = table.getByRole("rowheader");
    await expect(rows).toHaveCount(5);
    expect((await rows.allTextContents()).map((text) => text.trim()).sort()).toEqual([...SCHOOLS].sort());
    const goal = page.getByRole("progressbar", { name: "Objectif collectif" });
    await expect(goal).toHaveAttribute("aria-valuemax", "1000");
    await expect(goal).toHaveAttribute("aria-valuetext", /sur 1\s000/);
  });

  test("opens and closes the FAQ with the keyboard, one answer at a time", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("summary", { hasText: "Qui peut s’inscrire" });
    const second = page.locator("summary", { hasText: "C’est payant" });
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(first.locator("..")).toHaveAttribute("open", "");
    await expect(page.getByText("avec leur adresse email d’école.")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(second).toBeFocused();
    await page.keyboard.press("Space");
    await expect(second.locator("..")).toHaveAttribute("open", "");
    await expect(first.locator("..")).not.toHaveAttribute("open", "");

    await page.keyboard.press("Enter");
    await expect(second.locator("..")).not.toHaveAttribute("open", "");
  });

  test("links to the four draft legal pages", async ({ page }) => {
    await page.goto("/");
    const legal = page.getByRole("navigation", { name: "Informations légales" });
    for (const name of [
      "Mentions légales",
      "Conditions d’utilisation",
      "Confidentialité",
      "Transparence du classement",
    ]) {
      await expect(legal.getByRole("link", { name })).toBeVisible();
    }
  });
});

test.describe("waiting list", () => {
  test("joins with a school address and sends the welcome email with the referral link", async ({
    page,
    request,
  }) => {
    const address = freshAddress("epita.fr");
    await page.goto("/");
    const { input, submit, form } = await joinForm(page);
    await input.fill(address);
    await submit.click();
    await expect(form.getByTestId("waitlist-success")).toContainText("C’est noté.");
    await expect(form.getByTestId("waitlist-success")).toBeFocused();

    let messages: Array<{ Subject: string; ID: string }> = [];
    await expect
      .poll(
        async () => {
          const response = await request.get(
            `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
          );
          messages = ((await response.json()) as { messages: typeof messages }).messages;
          return messages.map((message) => message.Subject);
        },
        { timeout: 15_000 },
      )
      .toEqual(["Tu es sur la liste d'attente"]);

    const [message] = messages;
    const detail = await request.get(`${MAILPIT_URL}/api/v1/message/${message?.ID}`);
    const body = (await detail.json()) as { Text: string };
    expect(body.Text).toMatch(/\/\?r=[0-9a-hjkmnp-tv-z]{10}/);
    expect(body.Text).toContain("EPITA");
  });

  test("answers the same when the address is already on the list, without a second email", async ({
    page,
    request,
  }) => {
    const address = freshAddress("isg.fr");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.goto("/");
      const { input, submit, form } = await joinForm(page);
      await input.fill(attempt === 0 ? address : address.toUpperCase());
      await submit.click();
      await expect(form.getByTestId("waitlist-success")).toBeVisible();
    }
    await page.waitForTimeout(1500);
    const response = await request.get(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
    );
    expect(((await response.json()) as { messages: unknown[] }).messages).toHaveLength(1);
  });

  test("explains inline why an address is refused", async ({ page }) => {
    await page.goto("/");
    const { input, submit, form } = await joinForm(page);

    await input.fill("prenom.nom@gmail.com");
    await submit.click();
    const alert = form.getByRole("alert");
    await expect(alert).toContainText("n’appartient pas à une école participante");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toBeFocused();

    await input.fill("prenom.nom@");
    await input.blur();
    await expect(alert).toContainText("ne ressemble pas à une adresse email");

    await input.fill("prenom.nom@esme.fr");
    await expect(alert).toBeEmpty();
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  test("recognises referral links", async ({ page }) => {
    await page.goto("/?r=0123456789");
    const { form } = await joinForm(page);
    await expect(form.getByText("Lien de parrainage reconnu")).toBeVisible();
    await expect(form.locator("input[name=referralCode]")).toHaveValue("0123456789");
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("still joins the list and reports refused addresses", async ({ page }) => {
      await page.goto("/");
      const { input, submit } = await joinForm(page);
      await input.fill("quelquun@gmail.com");
      await submit.click();
      await expect(page.locator("#rejoindre").getByRole("alert")).toContainText("école participante");

      const again = await joinForm(page);
      await again.input.fill(freshAddress("ipsa.fr"));
      await again.submit.click();
      await expect(page.locator("#rejoindre").getByTestId("waitlist-success")).toBeVisible();
    });
  });
});

test.describe("legal pages", () => {
  for (const legal of LEGAL_PAGES) {
    test(`${legal.path} is a readable draft`, async ({ page }) => {
      await page.goto(legal.path);
      await expect(page).toHaveTitle(`${legal.title} · Atomes`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(legal.title);
      await expect(page.getByRole("note")).toContainText("Brouillon — à valider par un juriste");
      await expect(
        page.getByRole("navigation", { name: "Pages légales" }).locator("[aria-current=page]"),
      ).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("the privacy policy lists purposes and legal bases", async ({ page }) => {
    await page.goto("/legal/confidentialite");
    const table = page.getByRole("table", { name: "Finalités, données et bases légales" });
    await expect(table.getByRole("row")).toHaveCount(11);
    await expect(table).toContainText("Consentement explicite (9.2.a)");
  });
});

test.describe("hero under study: the chemistry test", () => {
  test("plays with the keyboard, then bonds with a fictional profile", async ({ page }) => {
    await page.goto("/apercu/jeu");
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Trouve tes atomes crochus.");
    await page.getByRole("button", { name: "Trouve ton atome" }).click();
    // Focus follows the game: each question, then the result.
    await expect(
      page.getByRole("heading", { level: 2, name: /Question 1 sur 3 Ton QG à Lyon/ }),
    ).toBeFocused();
    await expect(page.getByRole("button", { name: "Un bar à la Croix-Rousse" })).toHaveAttribute(
      "aria-keyshortcuts",
      "2",
    );
    await page.keyboard.press("2");
    await expect(page.getByRole("heading", { level: 2, name: /Question 2 sur 3/ })).toBeFocused();
    await page.keyboard.press("3");
    await expect(page.getByRole("heading", { level: 2, name: /Question 3 sur 3/ })).toBeFocused();
    await page.getByRole("button", { name: "L’amour" }).click();
    // A bar in Croix-Rousse and always 10 minutes late: Retardine.
    await expect(page.getByRole("heading", { level: 2, name: "Ton atome Retardine" })).toBeFocused();
    await expect(page.getByText(/^Ton atome crochu : .+\.$/)).toBeVisible();
    await expect(page.getByText("Profil fictif : les vrais arrivent au lancement.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Rejoindre la liste" }).first()).toHaveAttribute(
      "href",
      "#rejoindre",
    );
    // The answers stay in the browser: replaying starts over.
    await page.getByRole("button", { name: "Rejouer" }).click();
    await expect(page.getByRole("heading", { level: 2, name: /Question 1 sur 3/ })).toBeFocused();
  });

  test("stays out of search engines, and only the heroes under study have an address", async ({ page }) => {
    await page.goto("/apercu/jeu");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    const response = await page.goto("/apercu/inconnu");
    expect(response?.status()).toBe(404);
  });

  test("has no detectable violations, before and after playing", async ({ page }) => {
    await page.goto("/apercu/jeu");
    await page.waitForFunction(() => document.documentElement.classList.contains("motion-ready"));
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Trouve ton atome" }).click();
    for (const key of ["1", "4", "4"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(600);
    }
    await expect(page.getByText(/^Ton atome crochu : /)).toBeVisible();
    await page.waitForTimeout(1500);
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
  });
});

test.describe("hero under study: the holographic hand", () => {
  test("likes a card from the keyboard, then deals it back after the match", async ({ page }) => {
    await page.goto("/apercu/holo");
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Trouve tes atomes crochus.");
    const hand = page.getByRole("list", { name: "Profils fictifs" });
    await expect(hand.getByRole("button")).toHaveCount(5);
    const lea = hand.getByRole("button", { name: "Liker Léa, ISG" });
    await lea.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "C’est réciproque !" })).toBeFocused();
    await expect(page.getByText(/^Léa t’a liké aussi\. Une liaison fictive/)).toBeVisible();
    // Behind the match, the hand and the title are out of reach.
    await expect(page.locator(".holo-stage")).toHaveAttribute("inert", "");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(lea).toBeFocused();
  });

  test("likes one card at a time", async ({ page }) => {
    await page.goto("/apercu/holo");
    await expect(page.getByRole("list", { name: "Profils fictifs" }).getByRole("button")).toHaveCount(5);
    // A second like while the first card is still flying is ignored (both clicks in one go).
    await page.evaluate(() => {
      for (const name of ["Liker Léa, ISG", "Liker Yanis, IPSA"]) {
        document.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)?.click();
      }
    });
    await expect(page.getByText(/^Léa t’a liké aussi/)).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.locator(".holo-card[data-away]")).toHaveCount(0);
  });

  test("passes a card thrown to the left, likes one thrown to the right", async ({ page, isMobile }) => {
    test.skip(isMobile, "Thrown with a mouse; a tap likes the card like a click");
    await page.goto("/apercu/holo");
    const cards = page.locator(".holo-card");
    const fling = async (index: number, direction: 1 | -1) => {
      const box = await cards.nth(index).boundingBox();
      if (!box) {
        throw new Error("No card to throw");
      }
      const x = box.x + box.width / 2;
      const y = box.y + 40;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let step = 1; step <= 8; step += 1) {
        await page.mouse.move(x + direction * step * 30, y - step * 4);
      }
      await page.mouse.up();
    };
    const match = page.getByRole("heading", { level: 2, name: "C’est réciproque !" });
    await page.waitForTimeout(2000);
    await fling(0, -1);
    await expect(cards.nth(0)).toHaveAttribute("data-flying", "");
    // Passed: no match, and the card comes back into the hand.
    await expect(cards.nth(0)).not.toHaveAttribute("data-flying");
    await expect(cards.nth(0)).not.toHaveAttribute("data-dealing");
    await expect(match).toHaveCount(0);
    await fling(4, 1);
    await expect(match).toBeVisible();
    await expect(page.getByText(/^Yanis t’a liké aussi/)).toBeVisible();
  });

  test("has no detectable violations, in the hand and in the match", async ({ page }) => {
    await page.goto("/apercu/holo");
    await page.waitForFunction(() => document.documentElement.classList.contains("motion-ready"));
    await page.waitForTimeout(2000);
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Liker Inès, Sup'Biotech" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "C’est réciproque !" })).toBeVisible();
    await page.waitForTimeout(1500);
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
  });
});

test.describe("hero under study: people", () => {
  test("follows the photographs one after the other, and the visitor can pause them", async ({ page }) => {
    await page.clock.install();
    await page.goto("/apercu/gens");
    // The title stays whole for assistive technologies; its last words change on screen.
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Trouve tes atomes crochus.");
    await expect(page.getByText("Photos d’illustration, pas des membres")).toBeVisible();
    const scene = page.locator(".gens-photo[data-active]");
    await expect(scene).toHaveAttribute("data-scene", "crochus");
    await page.clock.runFor(5300);
    await expect(scene).toHaveAttribute("data-scene", "amour");
    await page.getByRole("button", { name: "Mettre le diaporama en pause" }).click();
    await page.clock.runFor(12_000);
    await expect(scene).toHaveAttribute("data-scene", "amour");
    await page.getByRole("button", { name: "Relancer le diaporama" }).click();
    await page.clock.runFor(5300);
    await expect(scene).toHaveAttribute("data-scene", "potes");
  });

  test("has no detectable violations", async ({ page }) => {
    await page.goto("/apercu/gens");
    await page.waitForFunction(() => document.documentElement.classList.contains("motion-ready"));
    await page.waitForTimeout(2500);
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("keeps the first photograph, with no slideshow to pause", async ({ page }) => {
      await page.clock.install();
      await page.goto("/apercu/gens");
      await expect(page.locator(".gens-photo[data-active]")).toHaveAttribute("data-scene", "crochus");
      await page.clock.runFor(12_000);
      await expect(page.locator(".gens-photo[data-active]")).toHaveAttribute("data-scene", "crochus");
      await expect(page.getByRole("button", { name: "Mettre le diaporama en pause" })).toHaveCount(0);
    });
  });
});

test.describe("hero under study: glass", () => {
  test("shows the whole title, and draws no glass without a GPU", async ({ page }) => {
    await page.goto("/apercu/verre");
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Trouve tes atomes crochus.");
    await expect(page.getByRole("link", { name: "Rejoindre la liste" })).toBeVisible();
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
    // The test browser renders in software: the title stays as it is, with no glass over it.
    await expect(page.locator(".verre-canvas")).not.toHaveAttribute("data-live", /.*/);
  });

  test("has no detectable violations", async ({ page }) => {
    await page.goto("/apercu/verre");
    await page.waitForFunction(() => document.documentElement.classList.contains("motion-ready"));
    await page.waitForTimeout(2000);
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
  });
});

test.describe("accessibility (WCAG 2.2 AA)", () => {
  test("the landing has no detectable violations", async ({ page }) => {
    await page.goto("/");
    // The choreography (scroll reveals) loads after the page: wait for it, then let every reveal run.
    await page.waitForFunction(() => document.documentElement.classList.contains("motion-ready"));
    await scrollThrough(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("keeps the plain title, native scrolling and no violations", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("load");
      await page.waitForTimeout(1500);
      await expect(page.locator("[data-ion-field]")).toHaveAttribute("data-live", "false");
      await expect(page.locator("[data-ion-field] canvas")).toHaveCount(0);
      await expect(page.locator("html")).not.toHaveClass(/lenis/);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  });
});
