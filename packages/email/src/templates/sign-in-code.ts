import { type EmailLocale, footerFor, layout, type RenderedEmail } from "./layout";

const COPY = {
  fr: {
    subject: (code: string) => `${code} est ton code Atomes`,
    title: "Ton code de connexion",
    line: (code: string) => `Ton code de connexion : ${code}`,
    validity: (minutes: number) => `Il est valable ${minutes} minutes et ne sert qu'une fois.`,
    ignore: "Si tu n'as rien demandé, ignore cet email : personne ne peut se connecter sans ce code.",
  },
  en: {
    subject: (code: string) => `${code} is your Atomes code`,
    title: "Your sign-in code",
    line: (code: string) => `Your sign-in code: ${code}`,
    validity: (minutes: number) => `It is valid for ${minutes} minutes and works only once.`,
    ignore: "If you did not ask for it, ignore this email: nobody can sign in without this code.",
  },
} as const;

/** One-time sign-in code (ONB-02). A code, not a link: Microsoft 365 link scanners would consume links. */
export function signInCodeEmail(
  code: string,
  validityMinutes: number,
  locale: EmailLocale = "fr",
): RenderedEmail {
  if (!/^\d{6}$/.test(code)) {
    throw new Error("A sign-in code is made of 6 digits.");
  }
  const copy = COPY[locale];
  const footer = footerFor(locale);
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    subject: copy.subject(spaced),
    text: [copy.line(spaced), "", copy.validity(validityMinutes), copy.ignore, "", footer].join("\n"),
    html: layout({
      locale,
      preheader: copy.line(spaced),
      footer,
      body: `<p style="margin:0 0 16px 0;font-size:22px;font-weight:600;">${copy.title}</p>
<p style="margin:0 0 24px 0;font-size:40px;font-weight:700;letter-spacing:0.12em;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${spaced}</p>
<p style="margin:0 0 12px 0;">${copy.validity(validityMinutes)}</p>
<p style="margin:0;color:#6b6578;">${copy.ignore}</p>`,
    }),
  };
}
