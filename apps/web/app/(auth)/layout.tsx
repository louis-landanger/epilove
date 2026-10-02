import { ToastProvider } from "@epilove/ui";
import Link from "next/link";
import type { ReactNode } from "react";

/** Sign-in and onboarding: no app navigation, a calm and focused frame. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="relative isolate min-h-dvh overflow-hidden">
        <div
          aria-hidden="true"
          className="-z-10 pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_85%_-10%,color-mix(in_oklch,var(--color-plasma)_22%,transparent),transparent_70%),radial-gradient(40rem_30rem_at_-10%_110%,color-mix(in_oklch,var(--color-volt)_12%,transparent),transparent_70%)]"
        />
        <header className="flex items-center justify-between px-4 py-5 sm:px-10">
          <Link href="/" className="font-display font-semibold text-xl tracking-tight">
            epilove<span className="text-plasma">.</span>
          </Link>
        </header>
        {children}
      </div>
    </ToastProvider>
  );
}
