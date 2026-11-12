import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { getSupabase } from '../lib/supabase.ts'

/** Keep private Realtime channels authorized with the current access token. */
export function useRealtimeAuth(): void {
  const { session } = useAuth()

  useEffect(() => {
    const token = session?.access_token
    if (!token) return
    void getSupabase().realtime.setAuth(token)
  }, [session?.access_token])
}
