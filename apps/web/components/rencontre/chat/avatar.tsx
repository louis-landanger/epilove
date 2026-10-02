import { SchoolGlyph, schoolColor } from "../discovery/school";

export function Avatar({
  photoUrl,
  schoolSlug,
  size = "md",
  online = false,
}: {
  photoUrl: string | null;
  schoolSlug: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}) {
  const sizes = { sm: "size-10", md: "size-14", lg: "size-20" } as const;
  const color = schoolColor(schoolSlug);
  return (
    <span className={`relative inline-block shrink-0 ${sizes[size]}`}>
      <span
        className="block size-full overflow-hidden rounded-full border-2 bg-paper/10"
        style={{ borderColor: color }}
      >
        {photoUrl && (
          // biome-ignore lint/performance/noImgElement: signed imgproxy URL.
          <img src={photoUrl} alt="" className="size-full object-cover" />
        )}
      </span>
      <span
        aria-hidden="true"
        className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full border border-ink bg-ink"
        style={{ color }}
      >
        <SchoolGlyph slug={schoolSlug} className="size-3" />
      </span>
      {online && (
        <span
          aria-hidden="true"
          className="absolute top-0 right-0 size-3 rounded-full border-2 border-ink bg-volt"
        />
      )}
    </span>
  );
}
