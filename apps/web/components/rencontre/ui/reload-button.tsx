"use client";

import { Button } from "@epilove/ui";

export function ReloadButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}
