import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import { upsertMessageInCache } from './cache.ts'
import type { ThreadMessage } from './types.ts'

export function useEditMessage(spaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (message: ThreadMessage) => {
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('messages')
        .update({ body: message.body.trim() })
        .eq('id', message.id)
        .select('*')
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error("You can't edit this message.")
      return { ...data, authorLabel: message.authorLabel }
    },
    onSuccess: (row) => {
      upsertMessageInCache(queryClient, spaceId, row)
    },
  })
}
