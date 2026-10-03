// Direct imports: the landing does not need the rest of the design system (Lighthouse budgets).
import { ToastProvider } from "@epilove/ui/primitives/toast";
import type { ReactNode } from "react";
import { EasterEggs } from "@/components/acces/fun/easter-eggs";
import "@/components/acces/marketing/marketing.css";

/** Public pages: landing and legal pages (PLT-02). Film grain over the whole site. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="marketing">
        <span id="top" />
        {children}
        <div aria-hidden="true" className="grain" />
        <EasterEggs />
      </div>
    </ToastProvider>
  );
}
