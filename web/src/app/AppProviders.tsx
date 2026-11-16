import type { ReactNode } from "react";
import { BrowserRouter, useNavigate } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "react-aria-components";
import { AuthProvider } from "../auth/AuthContext.tsx";
import { createQueryClient } from "../lib/queryClient.ts";
import PwaRuntime from "../pwa/PwaRuntime.tsx";

const queryClient = createQueryClient();

function AriaRouter({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <RouterProvider
      navigate={(path) => {
        void navigate(path);
      }}
      useHref={(href) => href}
    >
      {children}
    </RouterProvider>
  );
}

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AriaRouter>
          <AuthProvider>
            <PwaRuntime />
            {children}
          </AuthProvider>
        </AriaRouter>
      </BrowserRouter>
      {import.meta.env.DEV ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
