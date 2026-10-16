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
    await expect(page.getByRole("list", { name: "Écoles concernées" }).getByRole("listitem")).toHaveText(
      SCHOOLS,
    );
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

  test("shows the field's diagnostics with ?debug=field, costs turned off with &no=", async ({ page }) => {
    await page.goto("/?debug=field&no=grain,anim");
    await expect(page.getByText("toucher pour copier")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-no", "grain anim");
    await expect(page.locator(".grain")).toBeHidden();
  });

  test("holds the race within the narrowest phones' screen", async ({ page }) => {
    // At 320 px the table's natural width once widened its column past the screen, the tubes'
    // rack with it, and the section clipped both.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    const table = page.getByRole("table", { name: /Classement de la course des écoles/ });
    await table.scrollIntoViewIfNeeded();
    const column = await table.locator("..").boundingBox();
    const box = await table.boundingBox();
    const rack = await page.locator(".race-rack").boundingBox();
    expect(column).not.toBeNull();
    expect(box).not.toBeNull();
    expect(rack).not.toBeNull();
    if (column && box && rack) {
      expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width + 0.5);
      expect(rack.x + rack.width).toBeLessThanOrEqual(320);
    }
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

test.describe("smooth scrolling", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "Lenis glides the wheel's scrolling: phones scroll by touch, natively, and have no menu.",
  );

  /** The landing once its choreography (Lenis smooth scrolling) runs. */
  async function smoothLanding(page: Page) {
    await page.goto("/");
    await page.waitForFunction(() => document.documentElement.classList.contains("lenis"));
  }

  test("keeps what is on screen in place when a section above it is laid out late", async ({ page }) => {
    await smoothLanding(page);
    // Straight down to the safety commitments, as a reload there lands: the sections passed over
    // are not laid out yet (content-visibility: auto), at a placeholder height.
    const safety = page.locator("#securite");
    await safety.evaluate((element) =>
      window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY, behavior: "instant" }),
    );
    await page.waitForTimeout(500);
    const top = () => safety.evaluate((element) => element.getBoundingClientRect().top);
    const before = await top();
    // Back up with the wheel: the sections above are laid out at their real height as they come near.
    await page.mouse.move(200, 300);
    for (let notch = 0; notch < 20; notch += 1) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(2000);
    // The page went up by what the wheel asked, nothing jumping as the sections above changed height.
    expect((await top()) - before).toBeCloseTo(2000, -1);
  });

  test("lands a menu link on its section, though the sections before it are not laid out yet", async ({
    page,
  }) => {
    await smoothLanding(page);
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Sécurité" })
      .click();
    const safety = page.locator("#securite");
    await expect(safety).toBeFocused();
    // Just below the fixed header (choreography.ts, HEADER_OFFSET).
    expect(await safety.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(72, -1);
  });
});

test.describe("rendering cost", () => {
  test("moves the steps and lights the manifesto without filters, which the GPU redraws at every frame", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => document.documentElement.classList.contains("motion-ready"));
    // The manifesto read through: its words in focus, none of them still drawn apart.
    await page.evaluate(() => {
      const manifesto = document.getElementById("manifeste");
      if (manifesto) {
        window.scrollTo(0, manifesto.getBoundingClientRect().bottom + window.scrollY - window.innerHeight);
      }
    });
    await expect
      .poll(() =>
        page
          .locator("#manifeste [data-reveal-words] *")
          .evaluateAll((words) => words.filter((word) => getComputedStyle(word).filter !== "none").length),
      )
      .toBe(0);

    // Halfway through the second step's arrival, the first recedes: darkened by its veil, not a filter.
    await page.evaluate(() => {
      const second = document.querySelectorAll("[data-step]")[1];
      if (second) {
        window.scrollTo(0, second.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.62);
      }
    });
    const first = page.locator("[data-step]").first();
    await expect
      .poll(() => first.locator(".step-veil").evaluate((veil) => Number(getComputedStyle(veil).opacity)))
      .toBeGreaterThan(0.1);
    expect(await first.locator("article").evaluate((article) => getComputedStyle(article).filter)).toBe(
      "none",
    );
    // The glass cards stand on their opaque panels: nothing behind them to blur.
    const blurred = await page
      .locator(".glass-card")
      .evaluateAll(
        (cards) => cards.filter((card) => getComputedStyle(card).backdropFilter !== "none").length,
      );
    expect(blurred).toBe(0);
  });

  test("restyles an element added to the landing, not the whole page", async ({ page, browser }) => {
    await page.goto("/");
    // The schools' stage beside the form swaps its logo and name every three seconds: elements
    // removed from the page, others added.
    const caption = page.locator(".join-logo-caption");
    await caption.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await browser.startTracing(page, { categories: ["devtools.timeline"] });
    await caption.evaluate((element) => {
      element.append(document.createElement("span"));
      // Styles the page now, within the trace.
      void document.body.offsetHeight;
    });
    const trace = JSON.parse((await browser.stopTracing()).toString()) as {
      traceEvents: Array<{ name: string; args?: { elementCount?: number } }>;
    };
    const restyled = trace.traceEvents
      .filter((event) => event.name === "UpdateLayoutTree")
      .map((event) => event.args?.elementCount ?? 0);
    // A handful of elements (the new one, and those animating meanwhile), not the hundreds on the page.
    expect(Math.max(0, ...restyled)).toBeLessThan(50);
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

test.describe("hero: the rivers of Lyon", () => {
  test("shows the whole title, and draws the rivers when the particles cannot", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Trouve tes atomes crochus.");
    await expect(
      page.getByText("À Lyon, même le Rhône et la Saône ont fini par se rencontrer."),
    ).toBeVisible();
    // Why Lyon: the campus is marked on the plan.
    await expect(page.locator(".fleuves-campus-name")).toHaveText("Campus IONIS");
    await expect(page.locator(".fleuves-campus-name")).toBeInViewport();
    // The test browser renders in software: no field, the courses drawn in dots instead.
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
    await expect(page.locator("[data-ion-field]")).toHaveAttribute("data-live", "false");
    await expect(page.locator(".fleuves-drawing")).toBeVisible();
    await expect(page.locator(".fleuves-drawing polyline")).toHaveCount(3);
    await expect(page.locator(".fleuves-drawing")).toHaveCSS("opacity", "1");
  });

  test("draws the plan of Lyon in dots, with or without the particles", async ({ page }) => {
    const plan = page.waitForResponse((response) => response.url().endsWith("/fleuves/lyon-plan.bin"));
    await page.goto("/");
    const response = await plan;
    expect(response.status()).toBe(200);
    expect((await response.body()).subarray(0, 4).toString("latin1")).toBe("APL1");
    // Lit once every dot is drawn, from the Confluence outwards; the canvases cover the hero.
    await expect(page.locator(".fleuves-city")).toHaveAttribute("data-lit", "true", { timeout: 20_000 });
    const hero = await page.locator("#hero").boundingBox();
    const canvas = await page.locator(".fleuves-city canvas").first().boundingBox();
    expect(canvas?.width).toBeCloseTo(hero?.width ?? 0, 0);
    expect(canvas?.height).toBeCloseTo(hero?.height ?? 0, 0);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("draws the whole plan at once, the rivers in dots, and the logo mark beside the manifesto", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.locator(".fleuves-city")).toHaveAttribute("data-lit", "true", { timeout: 20_000 });
      await expect(page.locator("[data-ion-field]")).toHaveAttribute("data-live", "false");
      await expect(page.locator(".fleuves-drawing")).toHaveCSS("opacity", "1");
      // The mark the particles would form stands drawn in dots, inside the screen.
      const mark = page.locator(".mark-drawing");
      await expect(mark).toHaveCSS("opacity", "1");
      const box = await mark.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(viewport).not.toBeNull();
      if (box && viewport) {
        // Its orbit (44 of the mark's 64 units wide, tilted) stays within the screen's width.
        expect(box.x + box.width * 0.16).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width * 0.84).toBeLessThanOrEqual(viewport.width);
      }
    });
  });

  test("keeps its call on screen when the page starts to scroll", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => document.documentElement.classList.contains("motion-ready"));
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(800);
    const call = page.getByRole("link", { name: "Rejoindre la liste" });
    await expect(call).toBeInViewport();
    const opacity = await call.evaluate((element) => {
      let product = 1;
      for (let node: Element | null = element; node; node = node.parentElement) {
        product *= Number(getComputedStyle(node).opacity);
      }
      return product;
    });
    expect(opacity).toBe(1);
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
