import { useState } from 'react'
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from 'react-aria-components'
import type { FamilyRole } from '../lib/database.helpers.ts'
import type { ThreadMessage } from './types.ts'
import QuotedMessage from './QuotedMessage.tsx'
import styles from './MessageItem.module.css'

export type MessageItemProps = {
  message: ThreadMessage
  isOwn: boolean
  role: FamilyRole
  archived: boolean
  quoteSource?: ThreadMessage | null
  onReply: (message: ThreadMessage) => void
  onEdit: (message: ThreadMessage) => void
  onDelete: (message: ThreadMessage) => void
  onScrollToQuote?: (messageId: string) => void
  onRetry?: (message: ThreadMessage) => void
  onRemoveFailed?: (message: ThreadMessage) => void
}

export default function MessageItem({
  message,
  isOwn,
  role,
  archived,
  quoteSource,
  onReply,
  onEdit,
  onDelete,
  onScrollToQuote,
  onRetry,
  onRemoveFailed,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)

  const deleted = message.deleted_at !== null
  const canPost = !archived
  const canEdit = isOwn && !deleted && canPost && !message.sendStatus
  const canDelete =
    !deleted &&
    canPost &&
    !message.sendStatus &&
    (isOwn || role === 'admin')
  const canReply = canPost && !message.sendStatus

  const timeLabel = formatTime(message.created_at)
  const fullTime = formatFullTime(message.created_at)

  if (deleted) {
    return (
      <article
        className={[styles.message, styles.deleted, isOwn && styles.own]
          .filter(Boolean)
          .join(' ')}
        aria-label={`${message.authorLabel}, message deleted`}
      >
        <p className={styles.deletedText}>Message deleted</p>
      </article>
    )
  }

  return (
    <article
      className={[styles.message, isOwn && styles.own]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${isOwn ? 'You' : message.authorLabel}, ${timeLabel}: ${message.body.slice(0, 80)}`}
    >
      <header className={styles.meta}>
        <strong className={styles.author}>
          {isOwn ? (
            <>
              You <span className="sr-only">({message.authorLabel})</span>
            </>
          ) : (
            message.authorLabel
          )}
        </strong>
        <time dateTime={message.created_at} title={fullTime}>
          {timeLabel}
        </time>
        {message.edited_at ? (
          <span className={styles.edited}>(edited)</span>
        ) : null}
        {message.sendStatus === 'sending' ? (
          <span className={styles.sending} role="status">
            Sending…
          </span>
        ) : null}
        {message.sendStatus === 'failed' ? (
          <span className={styles.failed} role="alert">
            Not sent
          </span>
        ) : null}
      </header>

      {message.reply_to_id ? (
        <QuotedMessage
          quote={quoteSource}
          onActivate={() => {
            if (message.reply_to_id && onScrollToQuote) {
              onScrollToQuote(message.reply_to_id)
            }
          }}
        />
      ) : null}

      {editing ? (
        <form
          className={styles.editForm}
          onSubmit={(e) => {
            e.preventDefault()
            onEdit({ ...message, body: draft })
            setEditing(false)
          }}
        >
          <label className="sr-only" htmlFor={`edit-${message.id}`}>
            Edit message
          </label>
          <textarea
            id={`edit-${message.id}`}
            className={styles.editArea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
          />
          <div className={styles.editActions}>
            <Button type="submit" className={styles.smallButton}>
              Save
            </Button>
            <Button
              type="button"
              className={styles.smallButton}
              onPress={() => {
                setDraft(message.body)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className={styles.body}>{message.body}</p>
      )}

      <footer className={styles.actions}>
        {message.sendStatus === 'failed' ? (
          <>
            <Button className={styles.action} onPress={() => onRetry?.(message)}>
              Retry
            </Button>
            <Button
              className={styles.action}
              onPress={() => onRemoveFailed?.(message)}
            >
              Remove
            </Button>
          </>
        ) : (
          <MenuTrigger>
            <Button className={styles.more} aria-label="More actions">
              More
            </Button>
            <Popover className={styles.menuPopover}>
              <Menu className={styles.menu}>
                {canReply ? (
                  <MenuItem onAction={() => onReply(message)}>Reply</MenuItem>
                ) : null}
                {canEdit ? (
                  <MenuItem onAction={() => setEditing(true)}>Edit</MenuItem>
                ) : null}
                {canDelete ? (
                  <MenuItem onAction={() => onDelete(message)}>Delete</MenuItem>
                ) : null}
              </Menu>
            </Popover>
          </MenuTrigger>
        )}
      </footer>
    </article>
  )
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatFullTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
