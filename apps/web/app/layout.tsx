import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import "./globals.css";

// next/font downloads the fonts at build time and serves them ourselves:
// no request to Google from visitors' browsers (docs/08-juridique-rgpd.md).
// Weight axis only here; the landing loads its own faces (headline with width
// and optical size, serif italics). The mono face is not preloaded: small
// labels swap in without competing with the first paint.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.meta");
  return {
    metadataBase: new URL(process.env.SITE_URL || process.env.APP_URL || "http://localhost:3000"),
    title: { default: "Epilove", template: "%s · Epilove" },
    description: t("description"),
    // Not public before launch.
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0a13",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
