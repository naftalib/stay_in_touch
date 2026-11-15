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
    if (error.message.includes('cannot remove the last admin')) {
      return {
        title:
          'This family needs at least one parent. Choose another parent before removing this one.',
        code: error.code,
      }
    }
    if (error.message.includes('cannot demote the last admin')) {
      return {
        title: 'This family needs at least one parent. Choose another parent first.',
        code: error.code,
      }
    }
    if (error.message.includes('space is archived')) {
      return {
        title: 'That space is archived. Restore it before renaming.',
        code: error.code,
      }
    }
    if (error.message.includes('grandparents do not get a space')) {
      return {
        title: "Grandparents don't get their own space.",
        code: error.code,
      }
    }
    if (error.code === '42501' || error.message.includes('permission')) {
      return {
        title: "You don't have permission to do that.",
        code: error.code,
      }
    }
    if (error.code === '22023') {
      return {
        title: error.message || "That didn't look right.",
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
    if (
      error.message.includes('Too many emails') ||
      error.message.includes('wait a minute') ||
      error.message.includes('Email service') ||
      error.message.includes('could not be delivered') ||
      error.message.includes("didn't go out")
    ) {
      return { title: error.message, code: undefined }
    }
    return {
      title: 'Something went wrong. Please try again.',
      detail: error.message,
      retryable: true,
    }
  }

  return { title: 'Something went wrong. Please try again.', retryable: true }
}
