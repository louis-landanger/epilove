import type { ReactNode } from "react";
import "@/components/acces/marketing/marketing.css";

/** Public pages: landing and legal pages (PLT-02). Film grain over the whole site. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="marketing">
      <span id="top" />
      {children}
      <div aria-hidden="true" className="grain" />
    </div>
  );
}
