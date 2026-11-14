import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { queryKeys } from '../lib/queryKeys.ts'
import { upsertMessageInCache } from './cache.ts'
import type { ThreadMessage } from './types.ts'

type SendMessageInput = {
  spaceId: string
  familyId: string
  memberId: string
  body: string
  replyToId?: string | null
  authorLabel: string
  messageId: string
}

async function sendMessage(
  input: SendMessageInput,
  userId: string,
): Promise<ThreadMessage> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('messages')
    .insert({
      id: input.messageId,
      space_id: input.spaceId,
      family_id: input.familyId,
      author_member_id: input.memberId,
      body: input.body.trim(),
      reply_to_id: input.replyToId ?? null,
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) throw error

  return {
    ...data,
    authorLabel: input.authorLabel,
  }
}

export function useSendMessage(spaceId: string, authorLabel: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: Omit<SendMessageInput, 'spaceId' | 'authorLabel'>) => {
      if (!user) throw new Error('Not signed in')
      return sendMessage({ ...input, spaceId, authorLabel }, user.id)
    },
    onMutate: (input) => {
      if (!user) return
      const now = new Date().toISOString()
      const optimistic: ThreadMessage = {
        id: input.messageId,
        space_id: spaceId,
        family_id: input.familyId,
        author_member_id: input.memberId,
        body: input.body.trim(),
        reply_to_id: input.replyToId ?? null,
        edited_at: null,
        deleted_at: null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
        authorLabel,
        sendStatus: 'sending',
      }
      upsertMessageInCache(queryClient, spaceId, optimistic)
      return { messageId: input.messageId }
    },
    onSuccess: (message) => {
      upsertMessageInCache(queryClient, spaceId, {
        ...message,
        sendStatus: undefined,
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.unread(message.family_id),
      })
    },
    onError: (_err, input) => {
      if (!user) return
      const failed: ThreadMessage = {
        id: input.messageId,
        space_id: spaceId,
        family_id: input.familyId,
        author_member_id: input.memberId,
        body: input.body.trim(),
        reply_to_id: input.replyToId ?? null,
        edited_at: null,
        deleted_at: null,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        authorLabel,
        sendStatus: 'failed',
      }
      upsertMessageInCache(queryClient, spaceId, failed)
    },
  })
}
