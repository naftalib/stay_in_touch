import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import { upsertMessageInCache } from './cache.ts'
import type { ThreadMessage } from './types.ts'

export function useDeleteMessage(spaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (message: ThreadMessage) => {
      const supabase = getSupabase()
      const deletedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('messages')
        .update({ deleted_at: deletedAt })
        .eq('id', message.id)
        .select('*')
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error("You can't delete this message.")
      return { ...data, authorLabel: message.authorLabel }
    },
    onSuccess: (row) => {
      upsertMessageInCache(queryClient, spaceId, row)
    },
  })
}
