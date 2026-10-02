"use client";

import { authClient } from "@epilove/auth/client";
import { cn } from "@epilove/ui";
import { BarChart3, BookOpen, Flag, Gavel, Images, LayoutDashboard, LogOut, ScrollText } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Vue d'ensemble", icon: LayoutDashboard, adminOnly: false },
  { href: "/photos", label: "Photos", icon: Images, adminOnly: false },
  { href: "/signalements", label: "Signalements", icon: Flag, adminOnly: false },
  { href: "/recours", label: "Recours", icon: Gavel, adminOnly: false },
  { href: "/tableaux-de-bord", label: "Tableaux de bord", icon: BarChart3, adminOnly: false },
  { href: "/journal", label: "Journal d'audit", icon: ScrollText, adminOnly: false },
  { href: "/contenus", label: "Contenus", icon: BookOpen, adminOnly: true },
] as const;

export function StaffNav({ role, pseudonym }: { role: "moderator" | "admin"; pseudonym: string }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav
      aria-label="Navigation du back-office"
      className="flex flex-col gap-6 border-paper/10 border-b p-4 lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:border-r lg:border-b-0"
    >
      <div className="flex flex-col">
        <span className="font-display font-semibold text-xl">
          epilove<span className="text-plasma">.</span>
        </span>
        <span className="font-mono text-paper/50 text-xs">
          {role === "admin" ? "Admin" : "Modération"} · {pseudonym}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1 lg:flex-col">
        {LINKS.filter((link) => !link.adminOnly || role === "admin").map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2 text-paper/70 text-sm transition-colors hover:bg-paper/5 hover:text-paper",
                  active && "bg-paper/10 text-paper",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={async () => {
          await authClient.signOut();
          router.replace("/connexion");
        }}
        className="flex items-center gap-3 rounded-2xl px-3 py-2 text-paper/60 text-sm hover:bg-paper/5 hover:text-paper lg:mt-auto"
      >
        <LogOut className="size-4" aria-hidden="true" />
        Se déconnecter
      </button>
    </nav>
  );
}
