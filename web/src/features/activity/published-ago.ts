const units: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * How long ago a version was published, such as "2 days ago" or "yesterday", for the
 * publisher line. Under a minute, or a time ahead of the clock, reads "just now".
 */
export function publishedAgo(publishedAt: string, now = new Date()): string {
  const seconds = Math.floor(
    (now.getTime() - new Date(publishedAt).getTime()) / 1000,
  );
  for (const [unit, size] of units) {
    if (seconds >= size) {
      return relative.format(-Math.floor(seconds / size), unit);
    }
  }
  return "just now";
}
