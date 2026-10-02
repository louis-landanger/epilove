import { chromium } from "@playwright/test";

const [, , url, out, w = "1280", h = "900", member = ""] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const context = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
if (member)
  await context.addCookies([{ name: "epilove-dev-member", value: member, url: "http://localhost:3000" }]);
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("console:", m.text());
});
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
