import type { ReactNode } from "react";

/**
 * Shell of the signed-in app: session guard, bottom tab bar on mobile, side
 * navigation on desktop (docs/02-design.md, section 6). Owned by stream A.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
