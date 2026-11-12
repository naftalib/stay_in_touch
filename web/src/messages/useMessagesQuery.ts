import { useInfiniteQuery } from '@tanstack/react-query'
import { messagesQueryKey } from './cache.ts'
import { fetchMessagesPage } from './fetchMessagesPage.ts'
import type { MessageCursor } from './types.ts'

export function useMessagesQuery(spaceId: string) {
  return useInfiniteQuery({
    queryKey: messagesQueryKey(spaceId),
    queryFn: ({ pageParam }) =>
      fetchMessagesPage(spaceId, pageParam as MessageCursor | undefined),
    initialPageParam: undefined as MessageCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
