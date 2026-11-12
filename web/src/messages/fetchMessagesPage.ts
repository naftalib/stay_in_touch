import { getSupabase } from '../lib/supabase.ts'
import type { FamilyMember } from '../lib/database.types.ts'
import { MESSAGES_PAGE_SIZE, type MessagesPage, type ThreadMessage } from './types.ts'

export async function fetchMessagesPage(
  spaceId: string,
  cursor?: string,
): Promise<MessagesPage> {
  const supabase = getSupabase()

  let query = supabase
    .from('messages')
    .select('*')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })
    .limit(MESSAGES_PAGE_SIZE)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: messages, error } = await query
  if (error) throw error

  const authorIds = [
    ...new Set((messages ?? []).map((m) => m.author_member_id)),
  ]

  const labels = new Map<string, string>()
  if (authorIds.length > 0) {
    const { data: members, error: membersError } = await supabase
      .from('family_members')
      .select('id, label')
      .in('id', authorIds)

    if (membersError) throw membersError
    for (const member of (members ?? []) as Pick<FamilyMember, 'id' | 'label'>[]) {
      labels.set(member.id, member.label)
    }
  }

  const items: ThreadMessage[] = (messages ?? []).map((message) => ({
    ...message,
    authorLabel: labels.get(message.author_member_id) ?? 'Family member',
  }))

  const oldest = items.at(-1)
  const nextCursor =
    items.length === MESSAGES_PAGE_SIZE && oldest
      ? oldest.created_at
      : null

  return { items: items.reverse(), nextCursor }
}

export async function fetchMessageById(
  messageId: string,
): Promise<ThreadMessage | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  if (!data) return null

  const { data: member } = await supabase
    .from('family_members')
    .select('label')
    .eq('id', data.author_member_id)
    .maybeSingle()

  return {
    ...data,
    authorLabel: member?.label ?? 'Family member',
  }
}
