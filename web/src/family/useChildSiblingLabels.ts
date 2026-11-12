import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "../lib/supabase.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { NavSibling } from "../shell/buildNav.ts";
import type { FamilyRole } from "../lib/database.helpers.ts";

/**
 * Other children's display names for the side nav.
 * The RPC returns labels only, so a child never receives a sibling's space id.
 */
export async function fetchChildSiblingLabels(familyId: string): Promise<NavSibling[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("nav_child_sibling_labels", {
    p_family_id: familyId,
  });
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({ label: row.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function useChildSiblingLabels(familyId: string, role: FamilyRole) {
  return useQuery({
    queryKey: [...queryKeys.members(familyId), "child-siblings"] as const,
    queryFn: () => fetchChildSiblingLabels(familyId),
    enabled: Boolean(familyId) && role === "member",
  });
}
