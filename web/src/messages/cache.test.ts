import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  messagesQueryKey,
  removeMessage,
  removeMessageFromCache,
  upsertMessage,
  upsertMessageInCache,
} from './cache.ts'
import type { MessagesPage, ThreadMessage } from './types.ts'

function sampleMessage(id: string, createdAt: string): ThreadMessage {
  return {
    id,
    space_id: 'space',
    family_id: 'family',
    author_member_id: 'member',
    body: `Hello ${id}`,
    reply_to_id: null,
    edited_at: null,
    deleted_at: null,
    created_by: 'user',
    created_at: createdAt,
    updated_at: createdAt,
    authorLabel: 'Mom',
  }
}

describe('message cache helpers', () => {
  it('upserts and removes messages in infinite pages', () => {
    const client = new QueryClient()
    const spaceId = 'space-1'

    client.setQueryData(messagesQueryKey(spaceId), {
      pages: [
        {
          items: [sampleMessage('a', '2020-01-02T00:00:00Z')],
          nextCursor: null,
        } satisfies MessagesPage,
      ],
      pageParams: [undefined],
    })

    upsertMessageInCache(
      client,
      spaceId,
      sampleMessage('b', '2020-01-03T00:00:00Z'),
    )

    let data = client.getQueryData<{ pages: MessagesPage[] }>(
      messagesQueryKey(spaceId),
    )
    expect(data?.pages[0].items.map((m) => m.id)).toEqual(['a', 'b'])

    upsertMessageInCache(client, spaceId, {
      ...sampleMessage('a', '2020-01-02T00:00:00Z'),
      body: 'Updated',
    })

    data = client.getQueryData<{ pages: MessagesPage[] }>(
      messagesQueryKey(spaceId),
    )
    expect(data?.pages[0].items.find((m) => m.id === 'a')?.body).toBe('Updated')

    removeMessageFromCache(client, spaceId, 'a')
    data = client.getQueryData<{ pages: MessagesPage[] }>(
      messagesQueryKey(spaceId),
    )
    expect(data?.pages[0].items.map((m) => m.id)).toEqual(['b'])
  })

  it('orders ties by id in pure upsert', () => {
    const pages: MessagesPage[] = [
      {
        items: [
          sampleMessage('a', '2020-01-01T00:00:00Z'),
          sampleMessage('b', '2020-01-01T00:00:00Z'),
        ],
        nextCursor: null,
      },
    ]
    const next = upsertMessage(pages, {
      ...sampleMessage('c', '2020-01-01T00:00:00Z'),
    })
    expect(next[0].items.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    const removed = removeMessage(next, 'b')
    expect(removed[0].items.map((m) => m.id)).toEqual(['a', 'c'])
  })
})
