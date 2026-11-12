import type { AuthError, PostgrestError } from '@supabase/supabase-js'

export type AppError = {
  title: string
  detail?: string
  code?: string
  retryable?: boolean
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as PostgrestError).code === 'string'
  )
}

function isAuthError(error: unknown): error is AuthError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as AuthError).name === 'AuthError'
  )
}

/** Map Supabase, PostgREST, and network failures to UI-friendly copy. */
export function mapError(error: unknown): AppError {
  if (error == null) {
    return { title: 'Something went wrong', retryable: true }
  }

  if (typeof error === 'string') {
    return { title: error }
  }

  if (isAuthError(error)) {
    if (error.message.toLowerCase().includes('invalid login credentials')) {
      return {
        title: 'Sign-in did not work',
        detail: 'Check the email address and try again.',
        code: error.code,
      }
    }
    return {
      title: 'Sign-in problem',
      detail: error.message,
      code: error.code,
    }
  }

  if (isPostgrestError(error)) {
    if (error.code === '42501' || error.message.includes('permission')) {
      return {
        title: 'Not allowed',
        detail: 'You may not have access to this anymore.',
        code: error.code,
      }
    }
    if (error.code === 'PGRST116') {
      return {
        title: 'Not found',
        detail: 'This item is no longer available.',
        code: error.code,
      }
    }
    return {
      title: 'Could not load data',
      detail: error.message,
      code: error.code,
      retryable: true,
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('Failed to fetch')) {
      return {
        title: 'You appear to be offline',
        detail: 'Check your connection and try again.',
        retryable: true,
      }
    }
    if (error.message.includes('VITE_SUPABASE')) {
      return {
        title: 'App is not configured',
        detail: error.message,
      }
    }
    return {
      title: 'Something went wrong',
      detail: error.message,
      retryable: true,
    }
  }

  return { title: 'Something went wrong', retryable: true }
}
