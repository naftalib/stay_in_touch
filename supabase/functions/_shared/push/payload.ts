import type { PushPayload } from "./types.ts";

/** Who and where only. This function has no parameter for message text. */
export function notificationBody(
  authors: string[],
  postCount: number,
  spaceTitle: string,
): string {
  if (postCount >= 3) {
    return `${postCount} new posts in ${spaceTitle}`;
  }
  const names: string[] = [];
  for (const author of authors) {
    const label = author.trim();
    if (label && !names.includes(label)) names.push(label);
  }
  if (names.length >= 2) {
    return `${names[0]} and ${names[1]} posted in ${spaceTitle}`;
  }
  return `${names[0] ?? "Someone"} posted in ${spaceTitle}`;
}

export function publicAppUrl(raw: string | undefined): string {
  const value = raw?.trim().replace(/\/$/, "") ?? "";
  if (!value) throw new Error("APP_URL is missing");
  if (value.includes("kong:8000")) {
    throw new Error("APP_URL must be the public origin");
  }
  return value;
}

export function buildPushPayload(input: {
  authors: string[];
  postCount: number;
  spaceTitle: string;
  familyId: string;
  spaceId: string;
  appUrl: string;
  appBadge: number;
}): PushPayload {
  const origin = publicAppUrl(input.appUrl);
  return {
    web_push: 8030,
    notification: {
      title: "Stay In Touch",
      body: notificationBody(input.authors, input.postCount, input.spaceTitle),
      navigate: `${origin}/f/${input.familyId}/s/${input.spaceId}/messages`,
      tag: `space:${input.spaceId}`,
      lang: "en",
      dir: "ltr",
    },
    app_badge: input.appBadge,
  };
}
