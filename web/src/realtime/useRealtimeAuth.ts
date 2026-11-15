import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { getSupabase } from '../lib/supabase.ts'

/**
 * Keep private Realtime channels authorized with the current access token.
 * useSpaceChannels depends on the access token, so a refresh unsubscribes and
 * joins again. That re-checks membership instead of trusting the old socket.
 */
export function useRealtimeAuth(): void {
  const { session } = useAuth()

  useEffect(() => {
    const token = session?.access_token
    if (!token) return
    void getSupabase().realtime.setAuth(token)
  }, [session?.access_token])
}
