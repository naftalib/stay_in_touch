import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { upsertMessageInCache, messagesQueryKey } from './cache.ts'
import type { ThreadMessage } from './types.ts'

type SendMessageInput = {
  spaceId: string
  familyId: string
  memberId: string
  body: string
}

async function sendMessage(input: SendMessageInput, userId: string): Promise<ThreadMessage> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('messages')
    .insert({
      space_id: input.spaceId,
      family_id: input.familyId,
      author_member_id: input.memberId,
      body: input.body.trim(),
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) throw error

  const { data: member } = await supabase
    .from('family_members')
    .select('label')
    .eq('id', input.memberId)
    .maybeSingle()

  return {
    ...data,
    authorLabel: member?.label ?? 'Family member',
  }
}

export function useSendMessage(spaceId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: Omit<SendMessageInput, 'spaceId'>) => {
      if (!user) throw new Error('Not signed in')
      return sendMessage({ ...input, spaceId }, user.id)
    },
    onSuccess: (message) => {
      upsertMessageInCache(queryClient, spaceId, message)
      void queryClient.invalidateQueries({ queryKey: messagesQueryKey(spaceId) })
    },
  })
}
