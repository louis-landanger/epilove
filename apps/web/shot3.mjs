import { chromium } from "@playwright/test";

const [, , S, path, name, member = "de000000-0000-7000-8000-000000000001", w = "390", h = "844"] =
  process.argv;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const context = await browser.newContext({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: 1,
  hasTouch: false,
});
await context.addCookies([{ name: "epilove-dev-member", value: member, url: "http://localhost:3000" }]);
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("console:", m.text().slice(0, 300));
});
await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${S}/${name}.png` });
await browser.close();
