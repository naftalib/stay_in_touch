export function photoAlt(
  caption: string | null | undefined,
  name: string,
  dateLabel: string,
): string {
  const trimmed = caption?.trim();
  if (trimmed) return trimmed;
  return `Photo from ${name}, ${dateLabel}`;
}

export const VIEW_URL_STALE_MS = 50 * 60 * 1000;

/** Refetch a signed link in the last 10 minutes of its hour. */
export function viewUrlNeedsRefresh(expiresAt: string, now = Date.now()): boolean {
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return true;
  return expiry - now <= 10 * 60 * 1000;
}
