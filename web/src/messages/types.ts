import type { Message } from "../lib/database.helpers.ts";
import type { ThreadPhoto } from "../media/types.ts";

/** Message row enriched for thread display (labels filled by queries). */
export type ThreadMessage = Message & {
  authorLabel: string;
  sendStatus?: "sending" | "failed";
  photos?: ThreadPhoto[];
};

export const MESSAGES_PAGE_SIZE = 30;

export type MessageCursor = {
  createdAt: string;
  id: string;
};

export type MessagesPage = {
  items: ThreadMessage[];
  nextCursor: MessageCursor | null;
};
