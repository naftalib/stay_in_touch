import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import { useFamily } from '../family/FamilyProvider.tsx'
import { useFamilySpaceRealtime } from '../realtime/useFamilySpaceRealtime.ts'
import { useSpaces } from '../family/useSpaces.ts'
import Composer from './Composer.tsx'
import MessageList from './MessageList.tsx'
import { useMessagesQuery } from './useMessagesQuery.ts'
import { useSendMessage } from './useSendMessage.ts'
import styles from './Thread.module.css'

type ThreadProps = {
  familyId: string
  spaceId: string
  spaceTitle: string
  archived: boolean
}

export default function Thread({
  familyId,
  spaceId,
  spaceTitle,
  archived,
}: ThreadProps) {
  const { memberId } = useFamily()
  const queryClient = useQueryClient()
  const spacesQuery = useSpaces(familyId)
  const messagesQuery = useMessagesQuery(spaceId)
  const sendMessage = useSendMessage(spaceId)

  const spaceIds = useMemo(
    () => (spacesQuery.data ?? []).map((s) => s.id),
    [spacesQuery.data],
  )

  useFamilySpaceRealtime(familyId, spaceIds)

  const messages = useMemo(() => {
    const all = messagesQuery.data?.pages.flatMap((page) => page.items) ?? []
    return all.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
  }, [messagesQuery.data])

  useEffect(() => {
    if (!messagesQuery.isSuccess) return
    void (async () => {
      await getSupabase().rpc('mark_space_read', { p_space_id: spaceId })
      void queryClient.invalidateQueries({ queryKey: ['unread', familyId] })
    })()
  }, [familyId, messagesQuery.isSuccess, queryClient, spaceId])

  return (
    <section className={styles.thread} aria-labelledby="thread-title">
      <header className={styles.header}>
        <h1 id="thread-title">{spaceTitle}</h1>
        {archived ? <p className={styles.archived}>This space is archived.</p> : null}
      </header>

      {messagesQuery.isLoading ? (
        <p className={styles.status} role="status">
          Loading messages…
        </p>
      ) : messagesQuery.isError ? (
        <p className={styles.status} role="alert">
          Could not load messages.
        </p>
      ) : (
        <MessageList
          messages={messages}
          hasOlder={messagesQuery.hasNextPage}
          loadingOlder={messagesQuery.isFetchingNextPage}
          onLoadOlder={() => void messagesQuery.fetchNextPage()}
        />
      )}

      <Composer
        disabled={archived || sendMessage.isPending}
        disabledReason={
          archived
            ? 'Archived spaces cannot take new messages.'
            : undefined
        }
        onSend={async (body) => {
          await sendMessage.mutateAsync({
            familyId,
            memberId,
            body,
          })
        }}
      />
    </section>
  )
}
