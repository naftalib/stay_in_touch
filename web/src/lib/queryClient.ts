import { QueryClient } from '@tanstack/react-query'
import { mapError } from './errors.ts'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
      mutations: {
        onError: (error) => {
          console.error(mapError(error))
        },
      },
    },
  })
}
