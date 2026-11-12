import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Button, FieldError, Form, Input, Label, TextField } from 'react-aria-components'
import { getSupabase } from '../lib/supabase.ts'
import { mapError, type AppError } from '../lib/errors.ts'
import { useAuth } from './AuthContext.tsx'
import styles from './SignInPage.module.css'

type LocationState = { from?: { pathname: string } }

export default function SignInPage() {
  const { session } = useAuth()
  const location = useLocation()
  const from =
    (location.state as LocationState | null)?.from?.pathname ?? '/'

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  if (session) {
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const trimmed = email.trim()
      const { error: authError } = await getSupabase().auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      })
      if (authError) {
        setError(mapError(authError))
        return
      }
      setSent(true)
    } catch (caught) {
      setError(mapError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Stay In Touch</h1>
        <p className={styles.lede}>
          Sign in with the email address your family invited. We send a link and
          a one-time code.
        </p>

        {sent ? (
          <p className={styles.success} role="status">
            Check your email for a sign-in link and code. You can close this tab
            after you sign in on another device.
          </p>
        ) : (
          <Form className={styles.form} onSubmit={handleSubmit}>
            <TextField
              name="email"
              type="email"
              isRequired
              value={email}
              onChange={setEmail}
              autoComplete="email"
              className={styles.field}
            >
              <Label>Email</Label>
              <Input className={styles.input} placeholder="you@example.test" />
              <FieldError className={styles.fieldError} />
            </TextField>

            {error ? (
              <p className={styles.error} role="alert">
                <strong>{error.title}</strong>
                {error.detail ? ` ${error.detail}` : null}
              </p>
            ) : null}

            <Button
              type="submit"
              className={styles.button}
              isDisabled={submitting}
            >
              {submitting ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
          </Form>
        )}

        <p className={styles.footer}>
          Need an account? Ask a parent in your family to send an invite.
        </p>
      </div>
    </main>
  )
}
