/** Invite links always come from APP_URL. The token stays in the fragment. */
export function buildInviteUrl(appUrl: string, token: string): string {
  const base = appUrl.endsWith("/") ? appUrl : `${appUrl}/`;
  const url = new URL("invite", base);
  url.search = "";
  url.hash = token;
  return url.toString();
}
