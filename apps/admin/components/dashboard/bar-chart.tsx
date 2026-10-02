/**
 * Daily bars in plain SVG (no chart library). The figures are also given
 * as a table for screen readers.
 */
export function DailyBars({
  title,
  points,
}: {
  title: string;
  points: ReadonlyArray<{ day: string; count: number }>;
}) {
  const max = Math.max(1, ...points.map((point) => point.count));
  const width = 100 / Math.max(points.length, 1);
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const label = (day: string) =>
    new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${day}T00:00:00Z`),
    );
  return (
    <figure className="flex flex-col gap-3 rounded-3xl border border-paper/15 bg-paper/[0.03] p-5">
      <figcaption className="flex items-baseline justify-between gap-4 text-paper/70 text-sm">
        <span>{title}</span>
        <span className="font-mono text-paper tabular-nums">{total}</span>
      </figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-32 w-full" aria-hidden="true">
        {points.map((point, index) => {
          const height = (point.count / max) * 38;
          return (
            <rect
              key={point.day}
              x={index * width + width * 0.15}
              y={40 - height}
              width={width * 0.7}
              height={Math.max(height, point.count > 0 ? 0.8 : 0.2)}
              rx={0.4}
              className={point.count > 0 ? "fill-plasma" : "fill-paper/15"}
            />
          );
        })}
      </svg>
      <div className="flex justify-between font-mono text-paper/50 text-xs" aria-hidden="true">
        <span>{points[0] ? label(points[0].day) : ""}</span>
        <span>{points.at(-1) ? label(points.at(-1)?.day ?? "") : ""}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Nombre</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <td>{label(point.day)}</td>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Every day of the period, including those without any sign-up. */
export function fillDays(
  points: ReadonlyArray<{ day: string; count: number }>,
  end: Date,
  days: number,
): Array<{ day: string; count: number }> {
  const byDay = new Map(points.map((point) => [point.day, point.count]));
  const parisToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(end);
  const last = new Date(`${parisToday}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(last.getTime() - (days - 1 - index) * 86_400_000);
    const day = date.toISOString().slice(0, 10);
    return { day, count: byDay.get(day) ?? 0 };
  });
}
