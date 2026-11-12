import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys.ts'
import type { MessagesPage, ThreadMessage } from './types.ts'

export const messagesQueryKey = (spaceId: string) =>
  queryKeys.messages(spaceId)

export function compareMessages(a: ThreadMessage, b: ThreadMessage): number {
  const ta = new Date(a.created_at).getTime()
  const tb = new Date(b.created_at).getTime()
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

export function sortMessages(items: ThreadMessage[]): ThreadMessage[] {
  return [...items].sort(compareMessages)
}

function dedupeById(items: ThreadMessage[]): ThreadMessage[] {
  const seen = new Set<string>()
  const out: ThreadMessage[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

export function upsertMessageInCache(
  queryClient: QueryClient,
  spaceId: string,
  message: ThreadMessage,
): void {
  queryClient.setQueryData<InfiniteData<MessagesPage>>(
    messagesQueryKey(spaceId),
    (data) => {
      if (!data) return data

      let replaced = false
      const pages = data.pages.map((page) => {
        const idx = page.items.findIndex((m) => m.id === message.id)
        if (idx === -1) return page
        replaced = true
        const items = [...page.items]
        items[idx] = message
        return { ...page, items: sortMessages(items) }
      })

      if (!replaced) {
        const first = pages[0] ?? { items: [], nextCursor: null }
        const items = dedupeById(sortMessages([...first.items, message]))
        pages[0] = { ...first, items }
      }

      return { ...data, pages }
    },
  )
}

export function removeMessageFromCache(
  queryClient: QueryClient,
  spaceId: string,
  messageId: string,
): void {
  queryClient.setQueryData<InfiniteData<MessagesPage>>(
    messagesQueryKey(spaceId),
    (data) => {
      if (!data) return data
      const pages = data.pages.map((page) => ({
        ...page,
        items: page.items.filter((m) => m.id !== messageId),
      }))
      return { ...data, pages }
    },
  )
}

export function upsertMessage(
  pages: MessagesPage[],
  row: ThreadMessage,
): MessagesPage[] {
  let replaced = false
  const next = pages.map((page) => {
    const idx = page.items.findIndex((m) => m.id === row.id)
    if (idx === -1) return page
    replaced = true
    const items = [...page.items]
    items[idx] = row
    return { ...page, items: sortMessages(items) }
  })
  if (!replaced && next.length > 0) {
    const first = next[0]
    next[0] = {
      ...first,
      items: dedupeById(sortMessages([...first.items, row])),
    }
  }
  return next
}

export function removeMessage(
  pages: MessagesPage[],
  id: string,
): MessagesPage[] {
  return pages.map((page) => ({
    ...page,
    items: page.items.filter((m) => m.id !== id),
  }))
}
