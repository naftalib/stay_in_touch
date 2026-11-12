import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import { queryKeys } from '../lib/queryKeys.ts'
import {
  removeMessageFromCache,
  upsertMessageInCache,
} from './cache.ts'
import { fetchMessagesByIds } from './fetchMessagesPage.ts'
import { useRealtimeAuth } from '../realtime/useRealtimeAuth.ts'

type BroadcastPayload = {
  record?: { id?: string; space_id?: string }
  old_record?: { id?: string }
  table?: string
}

function messageIdFromPayload(payload: BroadcastPayload): string | null {
  return payload.record?.id ?? payload.old_record?.id ?? null
}

/**
 * Subscribe to broadcast notices for every space in a family.
 * Refetches message rows by id under RLS (never trusts payload body).
 */
export function useSpaceChannels(
  familyId: string,
  spaceIds: string[],
  openSpaceId: string | undefined,
  onForeignMessage?: (authorLabel: string, preview: string) => void,
): void {
  useRealtimeAuth()
  const queryClient = useQueryClient()
  const pendingRef = useRef<Map<string, Set<string>>>(new Map())
  const timerRef = useRef<number | null>(null)
  const unreadDebounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (!familyId || spaceIds.length === 0) return

    const supabase = getSupabase()

    const flush = async () => {
      const pending = pendingRef.current
      pendingRef.current = new Map()
      for (const [spaceId, ids] of pending) {
        const list = [...ids]
        const rows = await fetchMessagesByIds(list)
        const fetched = new Set(rows.map((r) => r.id))
        for (const row of rows) {
          upsertMessageInCache(queryClient, spaceId, row)
          if (
            spaceId === openSpaceId &&
            row.author_member_id &&
            onForeignMessage
          ) {
            /* announcer handled in Thread via cache diff */
          }
        }
        for (const id of list) {
          if (!fetched.has(id)) {
            removeMessageFromCache(queryClient, spaceId, id)
          }
        }
      }
    }

    const scheduleFlush = () => {
      if (timerRef.current != null) return
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        void flush()
      }, 100)
    }

    const scheduleUnread = () => {
      if (unreadDebounceRef.current != null) return
      unreadDebounceRef.current = window.setTimeout(() => {
        unreadDebounceRef.current = null
        void queryClient.invalidateQueries({
          queryKey: queryKeys.unread(familyId),
        })
      }, 300)
    }

    const channels = spaceIds.map((spaceId) => {
      const topic = `space:${spaceId}`

      const handle = (payload: { payload?: BroadcastPayload }) => {
        const body = payload.payload ?? {}
        if (body.table && body.table !== 'messages') {
          scheduleUnread()
          return
        }
        const messageId = messageIdFromPayload(body)
        if (!messageId) return

        let set = pendingRef.current.get(spaceId)
        if (!set) {
          set = new Set()
          pendingRef.current.set(spaceId, set)
        }
        set.add(messageId)
        scheduleFlush()
        scheduleUnread()
      }

      return supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, handle)
        .on('broadcast', { event: 'UPDATE' }, handle)
        .subscribe()
    })

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      if (unreadDebounceRef.current != null) {
        window.clearTimeout(unreadDebounceRef.current)
      }
      for (const channel of channels) {
        void supabase.removeChannel(channel)
      }
    }
  }, [familyId, onForeignMessage, openSpaceId, queryClient, spaceIds])
}
