import { FOOTER, layout, type RenderedEmail } from "./layout";

/** One-time sign-in code (ONB-02). A code, not a link: Microsoft 365 link scanners would consume links. */
export function signInCodeEmail(code: string, validityMinutes: number): RenderedEmail {
  if (!/^\d{6}$/.test(code)) {
    throw new Error("A sign-in code is made of 6 digits.");
  }
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    subject: `${spaced} est ton code Epilove`,
    text: [
      `Ton code de connexion : ${spaced}`,
      "",
      `Il est valable ${validityMinutes} minutes et ne sert qu'une fois.`,
      "Si tu n'as rien demandé, ignore cet email : personne ne peut se connecter sans ce code.",
      "",
      FOOTER,
    ].join("\n"),
    html: layout({
      preheader: `Ton code de connexion : ${spaced}`,
      footer: FOOTER,
      body: `<p style="margin:0 0 16px 0;font-size:22px;font-weight:600;">Ton code de connexion</p>
<p style="margin:0 0 24px 0;font-size:40px;font-weight:700;letter-spacing:0.12em;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${spaced}</p>
<p style="margin:0 0 12px 0;">Il est valable ${validityMinutes} minutes et ne sert qu'une fois.</p>
<p style="margin:0;color:#6b6578;">Si tu n'as rien demandé, ignore cet email : personne ne peut se connecter sans ce code.</p>`,
    }),
  };
}
