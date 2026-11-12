import { QueryClient } from "@tanstack/react-query";
import { mapError } from "./errors.ts";

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to fetch|networkerror|offline|load failed/i.test(error.message);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => failureCount < 1 && isNetworkError(error),
      },
      mutations: {
        onError: (error) => {
          console.error(mapError(error));
        },
      },
    },
  });
}
