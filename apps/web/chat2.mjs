import { chromium } from "@playwright/test";

const [, , S, matchId] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
async function open(member, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: "epilove-dev-member", value: member, url: "http://localhost:3000" }]);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(member.slice(-1), "pageerror:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(member.slice(-1), "console:", m.text().slice(0, 200));
  });
  await page.goto(`http://localhost:3000/messages/${matchId}`, { waitUntil: "networkidle" });
  return page;
}
const ines = await open("de000000-0000-7000-8000-000000000001", { width: 1280, height: 800 });
const hugo = await open("de000000-0000-7000-8000-000000000002", { width: 390, height: 844 });
await ines.waitForTimeout(1500);
const text = `Test temps réel ${Date.now() % 10000}`;
await ines.getByRole("textbox").fill(text);
await hugo.waitForTimeout(300);
await ines.keyboard.press("Enter");
const t0 = Date.now();
await hugo.getByRole("list", { name: "Messages" }).getByText(text).waitFor({ timeout: 8000 });
console.log("delivered in", Date.now() - t0, "ms");
await hugo.getByRole("textbox").fill("Bien reçu !");
await ines
  .getByText("Hugo écrit…")
  .waitFor({ timeout: 5000 })
  .then(() => console.log("typing indicator OK"))
  .catch(() => console.log("no typing indicator"));
await hugo.keyboard.press("Enter");
await ines.getByRole("list", { name: "Messages" }).getByText("Bien reçu !").waitFor({ timeout: 8000 });
await ines.waitForTimeout(1500);
await ines.screenshot({ path: `${S}/chat-desktop.png` });
await hugo.screenshot({ path: `${S}/chat-mobile.png` });
await browser.close();
