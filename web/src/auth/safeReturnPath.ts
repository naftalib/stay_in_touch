/** Same-origin path only. Rejects absolute URLs, protocol-relative URLs, and backslashes. */
export function safeReturnPath(pathname: string | undefined): string {
  if (!pathname) return "/";
  if (!pathname.startsWith("/")) return "/";
  if (pathname.startsWith("//") || pathname.startsWith("/\\")) return "/";
  if (pathname.includes("\\") || pathname.includes("://")) return "/";
  return pathname;
}
