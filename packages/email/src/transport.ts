import { createTransport } from "nodemailer";
import type { RenderedEmail } from "./templates/layout";

export interface Mailer {
  send(to: string, email: RenderedEmail): Promise<void>;
}

export interface MailerConfig {
  /** smtp://user:pass@host:port, or smtps:// for implicit TLS. */
  readonly smtpUrl: string;
  readonly from: string;
}

export function createMailer(config: MailerConfig): Mailer {
  const transport = createTransport(config.smtpUrl);
  return {
    async send(to, email) {
      await transport.sendMail({
        from: config.from,
        to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: email.unsubscribeUrl ? { "List-Unsubscribe": `<${email.unsubscribeUrl}>` } : undefined,
      });
    },
  };
}

export function mailerConfigFromEnv(env: Record<string, string | undefined> = process.env): MailerConfig {
  if (!env.SMTP_URL) {
    throw new Error("SMTP_URL must be set.");
  }
  return { smtpUrl: env.SMTP_URL, from: env.EMAIL_FROM ?? "Atomes <no-reply@atomes.local>" };
}

/** Collects emails in memory, for tests. */
export function createMemoryMailer(): Mailer & {
  readonly sent: Array<{ to: string; email: RenderedEmail }>;
} {
  const sent: Array<{ to: string; email: RenderedEmail }> = [];
  return {
    sent,
    async send(to, email) {
      sent.push({ to, email });
    },
  };
}
