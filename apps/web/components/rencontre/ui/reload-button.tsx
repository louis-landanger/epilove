"use client";

import { Button } from "@atomes/ui";

export function ReloadButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}
