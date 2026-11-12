import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthContext.tsx'

function safeReturnPath(pathname: string): { pathname: string } {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    return { pathname: '/' }
  }
  return { pathname }
}

export default function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="sr-only">
        Checking sign-in…
      </div>
    )
  }

  if (!session) {
    return (
      <Navigate
        to="/sign-in"
        replace
        state={{ from: safeReturnPath(location.pathname) }}
      />
    )
  }

  return <Outlet />
}
