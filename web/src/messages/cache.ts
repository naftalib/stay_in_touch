import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { MessagesPage, ThreadMessage } from './types.ts'

export const messagesQueryKey = (spaceId: string) =>
  ['messages', spaceId] as const

function sortByCreatedAt(items: ThreadMessage[]): ThreadMessage[] {
  return [...items].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
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
        return { ...page, items: sortByCreatedAt(items) }
      })

      if (!replaced) {
        const first = pages[0] ?? { items: [], nextCursor: null }
        const items = dedupeById(sortByCreatedAt([...first.items, message]))
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
