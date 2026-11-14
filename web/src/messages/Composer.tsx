import { useEffect, useState } from 'react'
import {
  Button,
  FieldError,
  Form,
  Label,
  TextArea,
  TextField,
} from 'react-aria-components'
import { mapError, type AppError } from '../lib/errors.ts'
import type { ThreadMessage } from './types.ts'
import styles from './Composer.module.css'

const MAX_LENGTH = 4000

type ComposerProps = {
  disabled?: boolean
  disabledReason?: string
  offline?: boolean
  replyTo?: ThreadMessage | null
  onCancelReply?: () => void
  onSend: (body: string, replyToId?: string | null) => Promise<void>
}

export default function Composer({
  disabled,
  disabledReason,
  offline,
  replyTo,
  onCancelReply,
  onSend,
}: ComposerProps) {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  const effectiveDisabled = disabled || offline

  useEffect(() => {
    if (!replyTo) return
    const area = document.querySelector<HTMLTextAreaElement>(
      '[data-composer-input]',
    )
    area?.focus()
  }, [replyTo])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || effectiveDisabled) return

    setSubmitting(true)
    setError(null)
    try {
      await onSend(trimmed, replyTo?.id ?? null)
      setBody('')
      onCancelReply?.()
    } catch (caught) {
      setError(mapError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  const nearLimit = body.length > MAX_LENGTH - 200

  if (effectiveDisabled) {
    return (
      <footer className={styles.footer}>
        <p className={styles.disabled} role="status">
          {offline
            ? "You're offline. Sending is disabled until you're back online."
            : (disabledReason ?? 'This space is read-only.')}
        </p>
      </footer>
    )
  }

  return (
    <footer className={styles.footer}>
      {replyTo ? (
        <FormReplyBar replyTo={replyTo} onCancel={onCancelReply} />
      ) : null}
      <Form className={styles.form} onSubmit={handleSubmit}>
        <TextField
          name="message"
          isRequired
          value={body}
          onChange={setBody}
          maxLength={MAX_LENGTH}
          className={styles.field}
        >
          <Label className="sr-only">Message</Label>
          <TextArea
            data-composer-input
            className={styles.input}
            placeholder="Write a message…"
            disabled={submitting}
            onKeyDown={handleKeyDown}
            rows={3}
          />
          <FieldError className={styles.fieldError} />
        </TextField>
        {nearLimit ? (
          <p className={styles.counter} aria-live="polite">
            {MAX_LENGTH - body.length} characters left
          </p>
        ) : null}
        <Button
          type="submit"
          className={styles.button}
          isDisabled={submitting || !body.trim()}
        >
          Send
        </Button>
      </Form>
      {error ? (
        <p className={styles.error} role="alert">
          {error.title}
        </p>
      ) : null}
    </footer>
  )
}

function FormReplyBar({
  replyTo,
  onCancel,
}: {
  replyTo: ThreadMessage
  onCancel?: () => void
}) {
  return (
    <div className={styles.replyBanner}>
      <span>
        Replying to {replyTo.authorLabel}:{' '}
        {(replyTo.body.split('\n')[0] ?? '').slice(0, 60)}
      </span>
      {onCancel ? (
        <Button type="button" className={styles.cancelReply} onPress={onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  )
}
