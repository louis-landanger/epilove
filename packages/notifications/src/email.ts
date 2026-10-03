import nodemailer from "nodemailer";

/** An e-mail to one member. The address is never logged. */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Link to manage e-mails (RFC 2369 `List-Unsubscribe`). */
  readonly unsubscribeUrl?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** SMTP delivery (Mailpit in development, the provider's relay in production). */
export function smtpSender(url: string, from: string): EmailSender {
  const transport = nodemailer.createTransport(url);
  return {
    async send(message) {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: message.unsubscribeUrl ? { "List-Unsubscribe": `<${message.unsubscribeUrl}>` } : undefined,
      });
    },
  };
}

export function smtpSenderFromEnv(env: Record<string, string | undefined> = process.env): EmailSender | null {
  return env.SMTP_URL
    ? smtpSender(env.SMTP_URL, env.EMAIL_FROM ?? "Epilove <noreply@epilove.invalid>")
    : null;
}

/** Keeps e-mails in memory (tests). */
export function createMemoryEmailSender() {
  const sent: EmailMessage[] = [];
  const sender: EmailSender = {
    async send(message) {
      sent.push(message);
    },
  };
  return { sender, sent };
}
