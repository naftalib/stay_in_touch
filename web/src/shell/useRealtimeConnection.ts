import { useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase.ts'

/** Tracks whether any realtime channel is in a non-connected state. */
export function useRealtimeConnection() {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const supabase = getSupabase()
    const onState = () => {
      const channels = supabase.getChannels()
      const anyBad = channels.some((ch) => {
        const state = ch.state
        return (
          state === 'errored' ||
          state === 'closed' ||
          state === 'leaving'
        )
      })
      setPaused(anyBad && channels.length > 0)
    }

    const interval = window.setInterval(onState, 2000)
    onState()
    return () => window.clearInterval(interval)
  }, [])

  return { paused }
}
