import type { ReactNode } from "react";
import { SiteFooter } from "@/components/acces/marketing/site-footer";
import { SiteHeader } from "@/components/acces/marketing/site-header";

/** Draft legal pages: plain, readable typography between the site header and footer. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader onLanding={false} />
      <main id="contenu" tabIndex={-1} className="px-4 pt-28 pb-24 outline-none sm:px-10 sm:pt-36">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <SiteFooter onLanding={false} />
    </>
  );
}
