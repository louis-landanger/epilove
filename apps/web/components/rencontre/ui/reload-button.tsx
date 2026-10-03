"use client";

export function ReloadButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="rounded-full bg-paper px-5 py-2.5 font-semibold text-ink"
    >
      {label}
    </button>
  );
}
