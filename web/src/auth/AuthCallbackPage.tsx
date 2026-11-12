import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { getSupabase } from '../lib/supabase.ts'
import { mapError, type AppError } from '../lib/errors.ts'
import { useAuth } from './AuthContext.tsx'
import styles from './AuthCallbackPage.module.css'

export default function AuthCallbackPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<AppError | null>(null)
  const [working, setWorking] = useState(true)

  useEffect(() => {
    if (session) {
      setWorking(false)
      return
    }

    let cancelled = false

    async function finishAuth() {
      try {
        const supabase = getSupabase()
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            if (!cancelled) setError(mapError(exchangeError))
            return
          }
        } else {
          const { error: sessionError } = await supabase.auth.getSession()
          if (sessionError) {
            if (!cancelled) setError(mapError(sessionError))
            return
          }
        }

        if (!cancelled) {
          navigate('/', { replace: true })
        }
      } catch (caught) {
        if (!cancelled) setError(mapError(caught))
      } finally {
        if (!cancelled) setWorking(false)
      }
    }

    void finishAuth()

    return () => {
      cancelled = true
    }
  }, [navigate, session])

  if (session) {
    return <Navigate to="/" replace />
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Signing you in</h1>
        {working && !error ? (
          <p role="status">One moment…</p>
        ) : null}
        {error ? (
          <>
            <p className={styles.error} role="alert">
              <strong>{error.title}</strong>
              {error.detail ? ` ${error.detail}` : null}
            </p>
            <Link className={styles.link} to="/sign-in">
              Back to sign-in
            </Link>
          </>
        ) : null}
      </div>
    </main>
  )
}
