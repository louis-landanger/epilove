import type { Metadata } from "next";
import { connection } from "next/server";
import { StaffSignIn } from "@/components/staff-sign-in";

export const metadata: Metadata = { title: "Connexion" };

export default async function SignInPage() {
  // Rendered per request: every page carries a nonce-based CSP (proxy.ts).
  await connection();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-16">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-plasma text-xs uppercase tracking-[0.2em]">Epilove · Équipe</p>
        <h1 className="font-display font-semibold text-4xl tracking-tight">Modération</h1>
        <p className="text-paper/70">Accès réservé aux modératrices, modérateurs et administrateurs.</p>
      </div>
      <StaffSignIn />
    </main>
  );
}
