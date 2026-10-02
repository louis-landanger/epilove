import { chromium } from "@playwright/test";

const S = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addCookies([
  { name: "epilove-dev-member", value: "de000000-0000-7000-8000-000000000003", url: "http://localhost:3000" },
]);
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("console:", m.text().slice(0, 300));
});
await page.goto("http://localhost:3000/decouvrir", { waitUntil: "networkidle" });
for (let i = 0; i < 6; i++) {
  const name = await page.locator("h2").first().textContent();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(900);
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    console.log("match after liking", name);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${S}/liaison.png` });
    break;
  }
  console.log("liked", name, await page.locator("header p").first().textContent());
}
await browser.close();
