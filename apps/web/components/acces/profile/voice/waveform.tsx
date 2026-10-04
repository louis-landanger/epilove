import { cn } from "@atomes/ui";

/** Waveform bars (0 to 100), the played part highlighted. Decorative. */
export function Waveform({
  peaks,
  progress = 0,
  className,
}: {
  peaks: readonly number[];
  progress?: number;
  className?: string;
}) {
  const played = Math.round(progress * peaks.length);
  return (
    <span aria-hidden="true" className={cn("flex h-10 flex-1 items-center gap-[2px]", className)}>
      {peaks.map((peak, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: bars have no identity beyond their position
          key={index}
          className={cn(
            "w-full min-w-[2px] rounded-full transition-colors",
            index < played ? "bg-plasma" : "bg-paper/30",
          )}
          style={{ height: `${Math.max(8, peak)}%` }}
        />
      ))}
    </span>
  );
}

export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
