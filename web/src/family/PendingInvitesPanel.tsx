import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { usePendingInvitations } from "./usePendingInvitations.ts";
import { getSupabase } from "../lib/supabase.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import { mapError } from "../lib/errors.ts";
import styles from "./PendingInvitesPanel.module.css";

const DISMISS_KEY = "stay-dismissed-invites";

function dismissedIds(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function PendingInvitesPanel({ compact }: { compact?: boolean }) {
  const pending = usePendingInvitations();
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState<string[]>(() => dismissedIds());
  const [error, setError] = useState<string | null>(null);
  const rows = (pending.data ?? []).filter((row) => !hidden.includes(row.id));
  if (!rows.length) return null;

  function dismiss(id: string) {
    const next = [...hidden, id];
    setHidden(next);
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  }

  async function join(id: string) {
    setError(null);
    const { error: rpcError } = await getSupabase().rpc("accept_invite", { p_invitation_id: id });
    if (rpcError) {
      setError(
        rpcError.code === "42501"
          ? "This invitation isn't for this account or is no longer valid."
          : mapError(rpcError).title,
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.memberships() });
    await queryClient.invalidateQueries({ queryKey: queryKeys.myPendingInvitations() });
    window.location.assign("/");
  }

  return (
    <section className={compact ? styles.compact : styles.panel} aria-labelledby="pending-invites-title">
      <h2 id="pending-invites-title">
        {compact ? `You have an invitation to ${rows[0]?.family_name}` : "Pending invitations"}
      </h2>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.id} className={styles.row}>
            <p>
              {compact
                ? `${row.inviter_name} invited you to ${row.family_name}.`
                : `${row.inviter_name} invited you to join as ${row.label}.`}
            </p>
            <div className={styles.actions}>
              <Button className={styles.join} onPress={() => void join(row.id)}>
                Join {row.family_name}
              </Button>
              {compact ? (
                <Button className={styles.dismiss} onPress={() => dismiss(row.id)}>
                  Dismiss
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}