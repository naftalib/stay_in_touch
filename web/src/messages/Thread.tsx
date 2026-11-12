import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import { queryKeys } from '../lib/queryKeys.ts'
import { useFamily } from '../family/FamilyProvider.tsx'
import { useSpaceChannels } from './useSpaceChannels.ts'
import { useSpaces } from '../family/useSpaces.ts'
import { useOnlineStatus } from '../shell/useOnlineStatus.ts'
import ConnectionBanner from '../shell/ConnectionBanner.tsx'
import Composer from './Composer.tsx'
import MessageList from './MessageList.tsx'
import DeleteMessageDialog from './DeleteMessageDialog.tsx'
import NewMessageAnnouncer from './NewMessageAnnouncer.tsx'
import { useMessagesQuery } from './useMessagesQuery.ts'
import { useSendMessage } from './useSendMessage.ts'
import { useEditMessage } from './useEditMessage.ts'
import { useDeleteMessage } from './useDeleteMessage.ts'
import { compareMessages, removeMessageFromCache } from './cache.ts'
import type { ThreadMessage } from './types.ts'
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
  const { memberId, role, membership } = useFamily()
  const queryClient = useQueryClient()
  const spacesQuery = useSpaces(familyId)
  const messagesQuery = useMessagesQuery(spaceId)
  const sendMessage = useSendMessage(spaceId, membership.label)
  const editMessage = useEditMessage(spaceId)
  const deleteMessage = useDeleteMessage(spaceId)
  const { offline } = useOnlineStatus()

  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ThreadMessage | null>(null)
  const [showNewButton, setShowNewButton] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const prevCountRef = useRef(0)
  const prevLatestIdRef = useRef<string | null>(null)

  const spaceIds = useMemo(
    () => (spacesQuery.data ?? []).map((s) => s.id),
    [spacesQuery.data],
  )

  useSpaceChannels(familyId, spaceIds, spaceId)

  const messages = useMemo(() => {
    const all = messagesQuery.data?.pages.flatMap((page) => page.items) ?? []
    return [...all].sort(compareMessages)
  }, [messagesQuery.data])

  const messageById = useMemo(
    () => new Map(messages.map((m) => [m.id, m])),
    [messages],
  )

  useEffect(() => {
    const latest = messages.at(-1)
    const prevLatest = prevLatestIdRef.current
    if (
      latest &&
      prevLatest &&
      latest.id !== prevLatest &&
      latest.author_member_id !== memberId &&
      messages.length > prevCountRef.current
    ) {
      setAnnouncement(
        `New message from ${latest.authorLabel}: ${latest.body.slice(0, 80)}`,
      )
      setShowNewButton(true)
    }
    prevCountRef.current = messages.length
    prevLatestIdRef.current = latest?.id ?? null
  }, [memberId, messages])

  useEffect(() => {
    if (!messagesQuery.isSuccess) return
    void (async () => {
      await getSupabase().rpc('mark_space_read', { p_space_id: spaceId })
      void queryClient.invalidateQueries({ queryKey: queryKeys.unread(familyId) })
    })()
  }, [familyId, messagesQuery.isSuccess, queryClient, spaceId])

  const handleSend = useCallback(
    async (body: string, replyToId?: string | null) => {
      await sendMessage.mutateAsync({
        familyId,
        memberId,
        body,
        replyToId,
        messageId: crypto.randomUUID(),
      })
    },
    [familyId, memberId, sendMessage],
  )

  const handleEdit = useCallback(
    async (message: ThreadMessage) => {
      await editMessage.mutateAsync(message)
    },
    [editMessage],
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    await deleteMessage.mutateAsync(deleteTarget)
    setDeleteTarget(null)
  }, [deleteMessage, deleteTarget])

  const handleScrollToQuote = useCallback((messageId: string) => {
    document
      .getElementById(`msg-${messageId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const handleRetry = useCallback(
    async (message: ThreadMessage) => {
      removeMessageFromCache(queryClient, spaceId, message.id)
      await sendMessage.mutateAsync({
        familyId,
        memberId,
        body: message.body,
        replyToId: message.reply_to_id,
        messageId: message.id,
      })
    },
    [familyId, memberId, queryClient, sendMessage, spaceId],
  )

  return (
    <section className={styles.thread} aria-labelledby="thread-title">
      <h2 id="thread-title" className="sr-only">
        {spaceTitle} messages
      </h2>

      <ConnectionBanner offline={offline} />

      <NewMessageAnnouncer announcement={announcement} />

      {messagesQuery.isLoading ? (
        <p className={styles.status} role="status" aria-busy="true">
          Loading messages…
        </p>
      ) : messagesQuery.isError ? (
        <p className={styles.status} role="alert">
          Could not load messages. Try again.
        </p>
      ) : (
        <MessageList
          messages={messages}
          hasOlder={messagesQuery.hasNextPage}
          loadingOlder={messagesQuery.isFetchingNextPage}
          onLoadOlder={() => void messagesQuery.fetchNextPage()}
          showNewMessagesButton={showNewButton}
          onJumpToNew={() => {
            setShowNewButton(false)
            document
              .querySelector(`#msg-${messages.at(-1)?.id}`)
              ?.scrollIntoView({ block: 'end' })
          }}
          messageById={messageById}
          itemProps={{
            role,
            archived,
            memberId,
            onReply: setReplyTo,
            onEdit: handleEdit,
            onDelete: setDeleteTarget,
            onScrollToQuote: handleScrollToQuote,
            onRetry: handleRetry,
            onRemoveFailed: (m) =>
              removeMessageFromCache(queryClient, spaceId, m.id),
          }}
        />
      )}

      <Composer
        disabled={archived}
        disabledReason={
          archived
            ? 'This space is archived. You can read it but not post.'
            : undefined
        }
        offline={offline}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
      />

      <DeleteMessageDialog
        isOpen={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </section>
  )
}
