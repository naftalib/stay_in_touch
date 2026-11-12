import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import {
  removeMessageFromCache,
  upsertMessageInCache,
} from '../messages/cache.ts'
import { fetchMessageById } from '../messages/fetchMessagesPage.ts'
import { useRealtimeAuth } from './useRealtimeAuth.ts'

type BroadcastPayload = {
  record?: { id?: string; space_id?: string }
  old_record?: { id?: string }
}

function messageIdFromPayload(payload: BroadcastPayload): string | null {
  return payload.record?.id ?? payload.old_record?.id ?? null
}

/**
 * Subscribe to broadcast notices for every space the user can see in a family,
 * so unread badges stay warm while another space is open.
 */
export function useFamilySpaceRealtime(
  familyId: string,
  spaceIds: string[],
): void {
  useRealtimeAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!familyId || spaceIds.length === 0) return

    const supabase = getSupabase()
    const channels = spaceIds.map((spaceId) => {
      const topic = `space:${spaceId}`

      const handle = async (payload: { payload?: BroadcastPayload }) => {
        const messageId = messageIdFromPayload(payload.payload ?? {})
        if (!messageId) return

        const message = await fetchMessageById(messageId)
        if (message && message.space_id === spaceId) {
          upsertMessageInCache(queryClient, spaceId, message)
        } else {
          removeMessageFromCache(queryClient, spaceId, messageId)
        }

        void queryClient.invalidateQueries({ queryKey: ['unread', familyId] })
      }

      return supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, handle)
        .on('broadcast', { event: 'UPDATE' }, handle)
        .on('broadcast', { event: 'DELETE' }, handle)
        .subscribe()
    })

    return () => {
      for (const channel of channels) {
        void supabase.removeChannel(channel)
      }
    }
  }, [familyId, queryClient, spaceIds])
}
