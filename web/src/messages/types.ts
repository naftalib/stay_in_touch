import type { Message } from '../lib/database.types.ts'

/** Message row enriched for thread display (labels filled by queries). */
export type ThreadMessage = Message & {
  authorLabel: string
}

export const MESSAGES_PAGE_SIZE = 30

export type MessagesPage = {
  items: ThreadMessage[]
  /** ISO timestamp cursor for loading older messages (exclusive). */
  nextCursor: string | null
}
