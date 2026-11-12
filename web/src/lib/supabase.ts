import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Not called by the placeholder page. The build must succeed with no env file.
export function createSupabaseClient(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Use the publishable key, never a secret key.',
    )
  }

  return createClient(url, key)
}
