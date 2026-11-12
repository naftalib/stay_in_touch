import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types.ts'

export type AppSupabaseClient = SupabaseClient<Database>

/** Create a client (tests and rare cases). Production code should use `getSupabase()`. */
export function createSupabaseClient(): AppSupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Use the publishable key, never a secret key.',
    )
  }

  return createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
}

let singleton: AppSupabaseClient | undefined

export function getSupabase(): AppSupabaseClient {
  singleton ??= createSupabaseClient()
  return singleton
}
