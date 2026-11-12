import { getSupabase } from '../lib/supabase.ts'
import type { FamilyMember } from '../lib/database.types.ts'
import {
  MESSAGES_PAGE_SIZE,
  type MessageCursor,
  type MessagesPage,
  type ThreadMessage,
} from './types.ts'

const MESSAGE_COLS =
  'id, space_id, family_id, author_member_id, body, reply_to_id, edited_at, deleted_at, created_at, created_by, updated_at' as const

export async function fetchMessagesPage(
  spaceId: string,
  cursor?: MessageCursor,
  memberLabels?: Map<string, string>,
): Promise<MessagesPage> {
  const supabase = getSupabase()

  let query = supabase
    .from('messages')
    .select(MESSAGE_COLS)
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGES_PAGE_SIZE)

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const { data: messages, error } = await query
  if (error) throw error

  const authorIds = [
    ...new Set((messages ?? []).map((m) => m.author_member_id)),
  ]

  const labels = new Map(memberLabels)
  const missing = authorIds.filter((id) => !labels.has(id))
  if (missing.length > 0) {
    const { data: members, error: membersError } = await supabase
      .from('family_members')
      .select('id, label')
      .in('id', missing)

    if (membersError) throw membersError
    for (const member of (members ?? []) as Pick<
      FamilyMember,
      'id' | 'label'
    >[]) {
      labels.set(member.id, member.label)
    }
  }

  const items: ThreadMessage[] = (messages ?? []).map((message) => ({
    ...message,
    authorLabel: labels.get(message.author_member_id) ?? 'Family member',
  }))

  const oldest = items.at(-1)
  const nextCursor: MessageCursor | null =
    items.length === MESSAGES_PAGE_SIZE && oldest
      ? { createdAt: oldest.created_at, id: oldest.id }
      : null

  return { items: items.reverse(), nextCursor }
}

export async function fetchMessageById(
  messageId: string,
): Promise<ThreadMessage | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLS)
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

export async function fetchMessagesByIds(
  ids: string[],
): Promise<ThreadMessage[]> {
  if (ids.length === 0) return []
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLS)
    .in('id', ids)

  if (error) throw error

  const authorIds = [...new Set((data ?? []).map((m) => m.author_member_id))]
  const { data: members } = await supabase
    .from('family_members')
    .select('id, label')
    .in('id', authorIds)

  const labels = new Map(
    (members ?? []).map((m) => [m.id, m.label] as const),
  )

  return (data ?? []).map((message) => ({
    ...message,
    authorLabel: labels.get(message.author_member_id) ?? 'Family member',
  }))
}
