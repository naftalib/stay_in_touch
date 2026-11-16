const ZONE = "Asia/Jerusalem";

function wallParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

/** UTC instant for a wall-clock time in Asia/Jerusalem. */
export function jerusalemWallTime(year: number, month: number, day: number, hour: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const value = (type: string) => Number(formatted.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

export function tomorrowSevenJerusalem(now = new Date()): string {
  const wall = wallParts(now);
  const next = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1));
  return jerusalemWallTime(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    7,
  ).toISOString();
}

export function pausedUntilLabel(iso: string): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return `Paused until ${time}`;
}

export function eightHoursFrom(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
}
