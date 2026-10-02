const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("fr-FR");

export function formatShare(value: number | null): string {
  return value === null ? "—" : percent.format(value);
}

export function formatCount(value: number): string {
  return integer.format(value);
}

/** "45 min", "5,2 h", "3,1 j". */
export function formatHours(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value < 1) {
    return `${Math.max(1, Math.round(value * 60))} min`;
  }
  if (value < 48) {
    return `${decimal.format(value)} h`;
  }
  return `${decimal.format(value / 24)} j`;
}

export function formatBytes(value: number): string {
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${decimal.format(size)} ${units[unit]}`;
}
