import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "../lib/supabase.ts";
export type AuthStatus = "loading" | "signedIn" | "signedOut";

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  loading: boolean;
  displayName: string | undefined;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchDisplayName(userId: string): Promise<string | undefined> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.display_name ?? undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [displayName, setDisplayName] = useState<string | undefined>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const clearClientState = useCallback(async () => {
    const supabase = getSupabase();
    await supabase.removeAllChannels();
    queryClient.clear();
    setDisplayName(undefined);
  }, [queryClient]);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setStatus(data.session ? "signedIn" : "signedOut");
      })
      .catch(() => {
        if (active) setStatus("signedOut");
      });

    // The callback must not await other Supabase calls. Doing so holds the
    // auth lock and deadlocks getUser() and token refresh.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (next?.user) {
        setStatus("signedIn");
        return;
      }
      setStatus("signedOut");
      if (event === "SIGNED_OUT") {
        window.setTimeout(() => {
          void clearClientState().then(() => {
            navigate("/sign-in?signedOut=1", {
              replace: true,
              state: { signedOut: true },
            });
          });
        }, 0);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [clearClientState, navigate]);

  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    let cancelled = false;
    void fetchDisplayName(user.id).then((name) => {
      if (!cancelled) setDisplayName(name ?? user.email ?? undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  const signOut = useCallback(async () => {
    sessionStorage.setItem("stay-signed-out", "1");
    await clearClientState();
    await getSupabase().auth.signOut();
    navigate("/sign-in?signedOut=1", { replace: true, state: { signedOut: true } });
  }, [clearClientState, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      loading: status === "loading",
      displayName,
      signOut,
    }),
    [displayName, session, signOut, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
