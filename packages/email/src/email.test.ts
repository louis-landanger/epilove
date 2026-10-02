import { describe, expect, it } from "vitest";
import { createMailer, escapeHtml, signInCodeEmail, waitlistWelcomeEmail } from "./index";

describe("templates", () => {
  it("formats the sign-in code in both versions", () => {
    const email = signInCodeEmail("123456", 10);
    expect(email.subject).toBe("123 456 est ton code Epilove");
    expect(email.text).toContain("123 456");
    expect(email.html).toContain("123 456");
    expect(email.text).toContain("10 minutes");
  });

  it("refuses anything but six digits", () => {
    expect(() => signInCodeEmail("12345", 10)).toThrow();
    expect(() => signInCodeEmail("<b>1</b>", 10)).toThrow();
  });

  it("escapes interpolated values", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;",
    );
    const email = waitlistWelcomeEmail({ schoolName: "<b>ISG</b>", referralUrl: "https://x.test/?r=a&b" });
    expect(email.html).not.toContain("<b>ISG</b>");
    expect(email.html).toContain("r=a&amp;b");
  });
});

const smtpUrl = process.env.SMTP_URL;
const mailpitUrl = process.env.MAILPIT_URL ?? "http://localhost:8025";

/** Needs Mailpit (`pnpm services:up`). */
describe.skipIf(!smtpUrl)("smtp", () => {
  it("delivers through SMTP", async () => {
    const to = `test-${Date.now()}@epita.fr`;
    await createMailer({ smtpUrl: smtpUrl ?? "", from: "Epilove <no-reply@epilove.local>" }).send(
      to,
      signInCodeEmail("654321", 10),
    );
    const response = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const body = (await response.json()) as { messages: Array<{ Subject: string }> };
    expect(body.messages[0]?.Subject).toBe("654 321 est ton code Epilove");
  });
});
