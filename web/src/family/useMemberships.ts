import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext.tsx";
import { getSupabase } from "../lib/supabase.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { ActiveMembership } from "./types.ts";

async function fetchMemberships(userId: string): Promise<ActiveMembership[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("family_members")
    .select("*, families(id, name)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  type Row = (typeof data)[number] & {
    families: { id: string; name: string } | null;
  };

  return ((data ?? []) as Row[]).flatMap((row) => {
    if (!row.families) return [];
    const { families, ...member } = row;
    return [
      {
        ...member,
        family: { id: families.id, name: families.name },
      } satisfies ActiveMembership,
    ];
  });
}

export function useMemberships() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: [...queryKeys.memberships(), userId],
    queryFn: () => fetchMemberships(userId!),
    enabled: Boolean(userId),
  });
}
