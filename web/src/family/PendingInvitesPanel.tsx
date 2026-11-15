import { useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { usePendingInvitations } from "./usePendingInvitations.ts";
import { getSupabase } from "../lib/supabase.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import styles from "./PendingInvitesPanel.module.css";

export function PendingInvitesPanel({ compact }: { compact?: boolean }) {
  const pending = usePendingInvitations();
  const queryClient = useQueryClient();
  if (!pending.data?.length) return null;

  async function join(id: string) {
    const { error } = await getSupabase().rpc("accept_invite", { p_invitation_id: id });
    if (error) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.memberships() });
    await queryClient.invalidateQueries({ queryKey: queryKeys.myPendingInvitations() });
    window.location.assign("/");
  }

  return (
    <section className={compact ? styles.compact : styles.panel} aria-labelledby="pending-invites-title">
      <h2 id="pending-invites-title">Pending invitations</h2>
      <ul className={styles.list}>
        {pending.data.map((row) => (
          <li key={row.id} className={styles.row}>
            <p>
              {row.inviter_name} invited you to <strong>{row.family_name}</strong> as {row.label}.
            </p>
            <Button className={styles.join} onPress={() => void join(row.id)}>
              Join {row.family_name}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}