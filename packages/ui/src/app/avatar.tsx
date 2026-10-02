import { cn } from "../cn";

/** Member photo with an initial and a gradient fallback (never a broken image). */
export function Avatar({
  src,
  name,
  size = 48,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-plasma/60 to-volt/40 font-display font-semibold text-ink",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: signed imgproxy URLs are already optimised.
        <img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}
