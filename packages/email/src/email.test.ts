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

describe("moderation emails", () => {
  it("states the facts, the rule, the end date and how to appeal", async () => {
    const { moderationDecisionEmail } = await import("./templates/moderation");
    const email = moderationDecisionEmail({
      action: "suspension",
      rule: "Respect",
      statement: "Insultes répétées <script> dans plusieurs conversations.",
      until: new Date("2026-10-09T12:00:00Z"),
      appealUrl: "https://epilove.test/compte/recours",
    });
    expect(email.text).toContain("la suspension de ton compte");
    expect(email.text).toContain("9 octobre 2026");
    expect(email.text).toContain("https://epilove.test/compte/recours");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("tells reporters nothing about the outcome", async () => {
    const { reportHandledEmail } = await import("./templates/moderation");
    expect(reportHandledEmail().text).not.toMatch(/suspen|bann|avertissement/i);
  });
});

describe("English emails (PLT-04)", () => {
  it("translates the sign-in code and sets the document language", () => {
    const email = signInCodeEmail("123456", 10, "en");
    expect(email.subject).toBe("123 456 is your Epilove code");
    expect(email.text).toContain("valid for 10 minutes");
    expect(email.html).toContain('<html lang="en">');
    expect(email.text).toContain("independent student project");
  });

  it("translates the statement of reasons, rule labels and dates", async () => {
    const { moderationDecisionEmail, photoRejectedEmail, reverificationReminderEmail } = await import(
      "./templates/moderation"
    );
    const decision = moderationDecisionEmail({
      action: "restriction",
      rule: "respect",
      statement: "Repeated insults.",
      until: new Date("2026-10-09T12:00:00Z"),
      appealUrl: "https://epilove.test/compte/recours",
      locale: "en",
    });
    expect(decision.text).toContain("a restriction of your account");
    expect(decision.text).toContain("Respect for others (charter, rule 1)");
    expect(decision.text).toContain("9 October 2026");
    expect(decision.text).toContain("Appeal: https://epilove.test/compte/recours");
    expect(photoRejectedEmail("no_face", "en").text).toContain("your face cannot be seen");
    expect(
      reverificationReminderEmail(new Date("2027-10-01T00:00:00Z"), "https://x.test", "en").subject,
    ).toBe("Confirm your school address");
  });

  it("keeps French as the default with the French colon", async () => {
    const { moderationDecisionEmail, photoRejectedEmail } = await import("./templates/moderation");
    const decision = moderationDecisionEmail({
      action: "warning",
      rule: "consent",
      statement: "Message insistant.",
      until: null,
      appealUrl: "https://epilove.test/compte/recours",
    });
    expect(decision.text).toContain("Consentement (charte, règle 2)");
    expect(decision.text).toContain("Contester : https://epilove.test/compte/recours");
    expect(photoRejectedEmail("low_quality").text).toContain("trop floue");
    expect(
      waitlistWelcomeEmail({ schoolName: "ISG", referralUrl: "https://x.test", locale: "en" }).subject,
    ).toBe("You're on the waiting list");
  });
});

describe("photo verification emails (ONB-08)", () => {
  it("announces the badge or explains the refusal", async () => {
    const { verificationOutcomeEmail } = await import("./templates/moderation");
    expect(verificationOutcomeEmail({ approved: true }).subject).toContain("Photo vérifiée");
    const refused = verificationOutcomeEmail({ approved: false, reason: "gesture_mismatch" }, "en");
    expect(refused.text).toContain("the gesture does not match");
    expect(refused.text).toContain("selfie has been deleted");
  });
});
