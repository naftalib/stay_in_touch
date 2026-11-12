import { useInfiniteQuery } from '@tanstack/react-query'
import { messagesQueryKey } from './cache.ts'
import { fetchMessagesPage } from './fetchMessagesPage.ts'

export function useMessagesQuery(spaceId: string) {
  return useInfiniteQuery({
    queryKey: messagesQueryKey(spaceId),
    queryFn: ({ pageParam }) => fetchMessagesPage(spaceId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
