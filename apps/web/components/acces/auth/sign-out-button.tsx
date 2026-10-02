"use client";

import { authClient } from "@epilove/auth/client";
import { Button } from "@epilove/ui";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      className="w-fit"
      loading={pending}
      leadingIcon={<LogOut className="size-4" aria-hidden="true" />}
      onClick={async () => {
        setPending(true);
        await authClient.signOut().catch(() => undefined);
        router.replace("/connexion");
        router.refresh();
      }}
    >
      {label}
    </Button>
  );
}
