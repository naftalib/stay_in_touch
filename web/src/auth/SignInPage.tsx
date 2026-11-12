import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextField,
} from 'react-aria-components'
import { getSupabase } from '../lib/supabase.ts'
import { mapError, type AppError } from '../lib/errors.ts'
import { useAuth } from './AuthContext.tsx'
import styles from './SignInPage.module.css'

type LocationState = {
  from?: { pathname: string }
  signedOut?: boolean
}

function safeReturnPath(pathname: string | undefined): string {
  if (!pathname || !pathname.startsWith('/') || pathname.startsWith('//')) {
    return '/'
  }
  return pathname
}

export default function SignInPage() {
  const { session } = useAuth()
  const location = useLocation()
  const state = (location.state as LocationState | null) ?? {}
  const from = safeReturnPath(state.from?.pathname)

  const [tab, setTab] = useState<'password' | 'email'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  if (session) {
    return <Navigate to={from} replace />
  }

  async function handlePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const trimmed = email.trim()
      const { error: authError } = await getSupabase().auth.signInWithPassword({
        email: trimmed,
        password,
      })
      if (authError) {
        setError({
          title: "That email and password don't match.",
          code: authError.code,
        })
        return
      }
    } catch (caught) {
      setError(mapError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendLink(e: React.FormEvent<HTMLFormElement>) {
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
        if (authError.message.toLowerCase().includes('rate')) {
          setError({
            title: 'Please wait a minute before asking again.',
            code: authError.code,
          })
        } else {
          setError(mapError(authError))
        }
        return
      }
      setEmailSent(true)
    } catch (caught) {
      setError(mapError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const trimmed = email.trim()
      const { error: authError } = await getSupabase().auth.verifyOtp({
        email: trimmed,
        token: code.trim(),
        type: 'email',
      })
      if (authError) {
        setError(mapError(authError))
        return
      }
    } catch (caught) {
      setError(mapError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  const otpMessage =
    "If this email is on the family list, we've sent a link and a 6-digit code. It works for one hour."

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Stay In Touch</h1>

        {state.signedOut ? (
          <p className={styles.notice} role="status">
            You&apos;ve been signed out. Please sign in again.
          </p>
        ) : null}

        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => setTab(key as 'password' | 'email')}
        >
          <TabList className={styles.tabList} aria-label="Sign-in method">
            <Tab id="password" className={styles.tab}>
              Sign in with password
            </Tab>
            <Tab id="email" className={styles.tab}>
              Email me a sign-in link
            </Tab>
          </TabList>

          <TabPanel id="password" className={styles.tabPanel}>
            <Form className={styles.form} onSubmit={handlePassword}>
              <EmailField email={email} onChange={setEmail} />
              <TextField
                name="password"
                isRequired
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                className={styles.field}
              >
                <Label>Password</Label>
                <div className={styles.passwordRow}>
                  <Input
                    className={styles.input}
                    type={showPassword ? 'text' : 'password'}
                  />
                  <Button
                    type="button"
                    className={styles.togglePassword}
                    onPress={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </Button>
                </div>
                <FieldError className={styles.fieldError} />
              </TextField>

              {error && tab === 'password' ? <ErrorBlock error={error} /> : null}

              <Button
                type="submit"
                className={styles.button}
                isDisabled={submitting}
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </Form>
          </TabPanel>

          <TabPanel id="email" className={styles.tabPanel}>
            {!emailSent ? (
              <Form className={styles.form} onSubmit={handleSendLink}>
                <EmailField email={email} onChange={setEmail} />
                {error && tab === 'email' && !emailSent ? (
                  <ErrorBlock error={error} />
                ) : null}
                <Button
                  type="submit"
                  className={styles.button}
                  isDisabled={submitting}
                >
                  {submitting ? 'Sending…' : 'Email me a sign-in link'}
                </Button>
              </Form>
            ) : (
              <>
                <p className={styles.success} role="status">
                  {otpMessage}
                </p>
                <Form className={styles.form} onSubmit={handleVerifyCode}>
                  <TextField
                    name="code"
                    isRequired
                    value={code}
                    onChange={setCode}
                    autoComplete="one-time-code"
                    className={styles.field}
                  >
                    <Label>6-digit code</Label>
                    <Input
                      className={styles.input}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                    />
                    <FieldError className={styles.fieldError} />
                  </TextField>
                  {error && tab === 'email' ? <ErrorBlock error={error} /> : null}
                  <Button
                    type="submit"
                    className={styles.button}
                    isDisabled={submitting}
                  >
                    {submitting ? 'Checking…' : 'Sign in with code'}
                  </Button>
                </Form>
              </>
            )}
          </TabPanel>
        </Tabs>

        <p className={styles.footer}>
          Need an account? Ask a parent in your family to send an invite.
        </p>
      </div>
    </main>
  )
}

function EmailField({
  email,
  onChange,
}: {
  email: string
  onChange: (v: string) => void
}) {
  return (
    <TextField
      name="email"
      type="email"
      isRequired
      value={email}
      onChange={onChange}
      autoComplete="email"
      className={styles.field}
    >
      <Label>Email</Label>
      <Input className={styles.input} placeholder="you@example.test" />
      <FieldError className={styles.fieldError} />
    </TextField>
  )
}

function ErrorBlock({ error }: { error: AppError }) {
  return (
    <p className={styles.error} role="alert">
      <strong>{error.title}</strong>
      {error.detail ? ` ${error.detail}` : null}
    </p>
  )
}
