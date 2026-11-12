import { useEffect, useRef } from 'react'
import type { ThreadMessage } from './types.ts'
import styles from './MessageList.module.css'

type MessageListProps = {
  messages: ThreadMessage[]
  hasOlder: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
}

export default function MessageList({
  messages,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: MessageListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const stickToEndRef = useRef(true)

  useEffect(() => {
    if (stickToEndRef.current) {
      endRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages.length])

  function handleScroll() {
    const node = scrollerRef.current
    if (!node) return

    const distanceFromEnd =
      node.scrollHeight - node.scrollTop - node.clientHeight
    stickToEndRef.current = distanceFromEnd < 48

    if (node.scrollTop < 48 && hasOlder && !loadingOlder) {
      onLoadOlder()
    }
  }

  return (
    <div
      className={styles.scroller}
      ref={scrollerRef}
      onScroll={handleScroll}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {hasOlder ? (
        <button
          type="button"
          className={styles.loadMore}
          onClick={onLoadOlder}
          disabled={loadingOlder}
        >
          {loadingOlder ? 'Loading older messages…' : 'Load older messages'}
        </button>
      ) : (
        <p className={styles.start}>Beginning of the thread</p>
      )}

      <ul className={styles.list}>
        {messages.map((message) => (
          <li key={message.id} className={styles.item}>
            <article className={styles.message}>
              <header className={styles.meta}>
                <strong>{message.authorLabel}</strong>
                <time dateTime={message.created_at}>
                  {formatWhen(message.created_at)}
                </time>
              </header>
              {message.deleted_at ? (
                <p className={styles.deleted}>[Message removed]</p>
              ) : (
                <p className={styles.body}>{message.body}</p>
              )}
            </article>
          </li>
        ))}
      </ul>
      <div ref={endRef} />
    </div>
  )
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
