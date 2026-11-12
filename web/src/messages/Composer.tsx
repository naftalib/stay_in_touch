import { useState } from 'react'
import { Button, FieldError, Form, Input, Label, TextField } from 'react-aria-components'
import { mapError, type AppError } from '../lib/errors.ts'
import styles from './Composer.module.css'

type ComposerProps = {
  disabled?: boolean
  disabledReason?: string
  onSend: (body: string) => Promise<void>
}

export default function Composer({
  disabled,
  disabledReason,
  onSend,
}: ComposerProps) {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || disabled) return

    setSubmitting(true)
    setError(null)
    try {
      await onSend(trimmed)
      setBody('')
    } catch (caught) {
      setError(mapError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <footer className={styles.footer}>
      {disabled ? (
        <p className={styles.disabled} role="status">
          {disabledReason ?? 'This space is read-only.'}
        </p>
      ) : (
        <Form className={styles.form} onSubmit={handleSubmit}>
          <TextField
            name="message"
            isRequired
            value={body}
            onChange={setBody}
            className={styles.field}
          >
            <Label className="sr-only">Message</Label>
            <Input
              className={styles.input}
              placeholder="Write a message…"
              disabled={submitting}
            />
            <FieldError className={styles.fieldError} />
          </TextField>
          <Button
            type="submit"
            className={styles.button}
            isDisabled={submitting || !body.trim()}
          >
            Send
          </Button>
        </Form>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error.title}
        </p>
      ) : null}
    </footer>
  )
}
