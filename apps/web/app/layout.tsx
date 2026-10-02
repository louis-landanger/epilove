import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// next/font downloads the fonts at build time and serves them ourselves:
// no request to Google from visitors' browsers (docs/08-juridique-rgpd.md).
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  variable: "--font-bricolage",
  display: "swap",
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Epilove", template: "%s · Epilove" },
  description:
    "Rencontres et amitiés entre étudiantes et étudiants vérifiés de l'EPITA, l'ESME, Sup'Biotech, l'ISG et l'IPSA à Lyon.",
  // Not public before launch.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#100e18",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
