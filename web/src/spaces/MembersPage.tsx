import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Dialog,
  Form,
  Heading,
  Input,
  Label,
  Modal,
  ModalOverlay,
  TextField,
} from "react-aria-components";
import { useFamily } from "../family/FamilyProvider.tsx";
import { useAllMembers } from "../family/useAllMembers.ts";
import { useInvitations } from "../family/useInvitations.ts";
import { useSpaces } from "../family/useSpaces.ts";
import { sendInvitationEmail } from "../family/inviteSend.ts";
import { getSupabase } from "../lib/supabase.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import { mapError, type AppError } from "../lib/errors.ts";
import type { FamilyRole } from "../lib/database.helpers.ts";
import ConfirmDialog, { type ConfirmRequest } from "../ui/ConfirmDialog.tsx";
import styles from "./MembersPage.module.css";

const ROLE_LABELS: Record<FamilyRole, string> = {
  admin: "Parent",
  grandparent: "Grandparent",
  member: "Child",
};

export default function MembersPage() {
  const { role, familyId, memberId } = useFamily();
  const membersQuery = useAllMembers(familyId, role === "admin");
  const invitationsQuery = useInvitations(familyId, role === "admin");
  const spacesQuery = useSpaces(familyId);
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [confirm, setConfirm] = useState<(ConfirmRequest & { run: () => Promise<void> }) | null>(
    null,
  );

  const activeMembers = useMemo(
    () => (membersQuery.data ?? []).filter((m) => m.status === "active"),
    [membersQuery.data],
  );
  const removedMembers = useMemo(
    () => (membersQuery.data ?? []).filter((m) => m.status === "removed"),
    [membersQuery.data],
  );

  if (role !== "admin") {
    return (
      <main className={styles.page}>
        <h1>Only parents can manage the family</h1>
      </main>
    );
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.members(familyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.membersAll(familyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations(familyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.spaces(familyId) }),
    ]);
  }

  const spaceForMember = (id: string) =>
    (spacesQuery.data ?? []).find((s) => s.owner_member_id === id)?.title ?? null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Family members</h1>
        <Button className={styles.primary} onPress={() => setInviteOpen(true)}>
          Invite someone
        </Button>
      </header>

      {status ? (
        <p className={styles.status} role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error.title}
        </p>
      ) : null}

      <section aria-labelledby="active-members">
        <h2 id="active-members">Active members</h2>
        <ul className={styles.list}>
          {activeMembers.map((member) => (
            <li key={member.id} className={styles.row}>
              <div>
                <strong>{member.label}</strong>
                <span className={styles.meta}>
                  {ROLE_LABELS[member.role]}
                  {spaceForMember(member.id) ? ` · Space: ${spaceForMember(member.id)}` : ""}
                </span>
              </div>
              <MemberActions
                member={member}
                selfId={memberId}
                onDone={(msg) => {
                  setStatus(msg);
                  setError(null);
                  void refresh();
                }}
                onError={(err) => {
                  setError(err);
                  setStatus(null);
                }}
                onConfirm={(request, run) => setConfirm({ ...request, run })}
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pending-invites">
        <h2 id="pending-invites">Pending invitations</h2>
        <ul className={styles.list}>
          {(invitationsQuery.data ?? [])
            .filter((i) => i.status === "pending")
            .map((invite) => (
              <li key={invite.id} className={styles.row}>
                <div>
                  <strong>{invite.label}</strong> ({invite.email})
                  <span className={styles.meta}>
                    {ROLE_LABELS[invite.role]} · Expires {new Date(invite.expires_at).toLocaleDateString()}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <Button
                    onPress={() =>
                      void resendInvite(invite.id, setStatus, setError, refresh)
                    }
                  >
                    Send again
                  </Button>
                  <Button
                    onPress={() =>
                      setConfirm({
                        title: "Cancel this invitation?",
                        body: "The link will stop working.",
                        confirmLabel: "Cancel invitation",
                        run: () => revokeInvite(invite.id, setStatus, setError, refresh),
                      })
                    }
                  >
                    Cancel invitation
                  </Button>
                </div>
              </li>
            ))}
        </ul>
      </section>

      {removedMembers.length > 0 ? (
        <details className={styles.removed}>
          <summary>Removed ({removedMembers.length})</summary>
          <ul className={styles.list}>
            {removedMembers.map((member) => (
              <li key={member.id}>
                {member.label} ({ROLE_LABELS[member.role]})
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ConfirmDialog
        request={confirm}
        onClose={(confirmed) => {
          const run = confirm?.run;
          setConfirm(null);
          if (confirmed && run) void run();
        }}
      />

      <InviteDialog
        familyId={familyId}
        isOpen={inviteOpen}
        onOpenChange={setInviteOpen}
        onComplete={(msg) => {
          setStatus(msg);
          void refresh();
        }}
        onError={setError}
      />
    </main>
  );
}

async function resendInvite(
  id: string,
  setStatus: (v: string) => void,
  setError: (v: AppError) => void,
  refresh: () => Promise<void>,
) {
  try {
    await sendInvitationEmail(id);
    setStatus("Invitation email sent.");
    await refresh();
  } catch (caught) {
    setError(mapError(caught));
  }
}

async function revokeInvite(
  id: string,
  setStatus: (v: string) => void,
  setError: (v: AppError | null) => void,
  refresh: () => Promise<void>,
) {
  const { error } = await getSupabase().rpc("revoke_invitation", { p_invitation_id: id });
  if (error) {
    setError(mapError(error));
    return;
  }
  setStatus("Invitation cancelled.");
  await refresh();
}

function MemberActions({
  member,
  selfId,
  onDone,
  onError,
  onConfirm,
}: {
  member: { id: string; label: string; role: FamilyRole };
  selfId: string;
  onDone: (msg: string) => void;
  onError: (err: AppError) => void;
  onConfirm: (request: ConfirmRequest, run: () => Promise<void>) => void;
}) {
  const [roleOpen, setRoleOpen] = useState(false);
  const [nextRole, setNextRole] = useState<FamilyRole>(member.role);

  async function remove() {
    const { error } = await getSupabase().rpc("remove_member", { p_member_id: member.id });
    if (error) {
      onError(mapError(error));
      return;
    }
    onDone(`${member.label} was removed.`);
  }

  async function changeRole() {
    const { error } = await getSupabase().rpc("change_member_role", {
      p_member_id: member.id,
      p_role: nextRole,
    });
    if (error) {
      onError(mapError(error));
      return;
    }
    setRoleOpen(false);
    onDone("Role updated.");
  }

  return (
    <div className={styles.rowActions}>
      <Button onPress={() => setRoleOpen(true)}>Change role</Button>
      <Button
        onPress={() =>
          onConfirm(
            {
              title: `Remove ${member.label}?`,
              body: `${member.label} will lose access right away. Their messages stay, and you can delete any of them. Their space will be archived.`,
              confirmLabel: "Remove from family",
            },
            remove,
          )
        }
        isDisabled={member.id === selfId && member.role === "admin"}
      >
        Remove from family
      </Button>
      {roleOpen ? (
        <ModalOverlay isOpen className={styles.overlay} onOpenChange={setRoleOpen} isDismissable>
          <Modal className={styles.modal}>
            <Dialog className={styles.dialog}>
              <Heading slot="title">Change role for {member.label}</Heading>
              <label className={styles.field}>
                Role
                <select
                  value={nextRole}
                  onChange={(e) => setNextRole(e.target.value as FamilyRole)}
                >
                  <option value="admin">Parent</option>
                  <option value="grandparent">Grandparent</option>
                  <option value="member">Child</option>
                </select>
              </label>
              <Button
                className={styles.primary}
                onPress={() =>
                  onConfirm(
                    {
                      title: `Change ${member.label} to ${ROLE_LABELS[nextRole]}?`,
                      body:
                        nextRole === "member"
                          ? "Children only see General and their own space."
                          : "This updates what they can see in the app.",
                      confirmLabel: "Change role",
                    },
                    changeRole,
                  )
                }
              >
                Save
              </Button>
              <Button onPress={() => setRoleOpen(false)}>Cancel</Button>
            </Dialog>
          </Modal>
        </ModalOverlay>
      ) : null}
    </div>
  );
}

function InviteDialog({
  familyId,
  isOpen,
  onOpenChange,
  onComplete,
  onError,
}: {
  familyId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (msg: string) => void;
  onError: (err: AppError | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [memberRole, setMemberRole] = useState<FamilyRole>("grandparent");
  const [createSpace, setCreateSpace] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    onError(null);
    try {
      const wantsSpace = memberRole !== "grandparent" && createSpace;
      const { data: invitationId, error: createError } = await getSupabase().rpc(
        "create_invitation",
        {
          p_family_id: familyId,
          p_email: email.trim(),
          p_role: memberRole,
          p_label: label.trim(),
          p_create_space: wantsSpace,
        },
      );
      if (createError || !invitationId) {
        onError(mapError(createError ?? new Error("Could not create invitation")));
        return;
      }
      try {
        await sendInvitationEmail(invitationId);
        onComplete("Invitation sent.");
      } catch {
        onComplete("Saved, but the email didn't go out. Try Send again.");
      }
      onOpenChange(false);
      setEmail("");
      setLabel("");
    } catch (caught) {
      onError(mapError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className={styles.overlay}>
      <Modal className={styles.modal}>
        <Dialog className={styles.dialog}>
          <Heading slot="title">Invite someone</Heading>
          <Form onSubmit={(e) => void submit(e)} className={styles.inviteForm}>
            <TextField isRequired value={email} onChange={setEmail} className={styles.field}>
              <Label>Email</Label>
              <Input type="email" autoComplete="email" />
            </TextField>
            <p className={styles.hint}>For a child on your device, you can use mom+name@your-email — optional.</p>
            <TextField isRequired value={label} onChange={setLabel} className={styles.field}>
              <Label>Name in the app</Label>
              <Input placeholder="Grandma" />
            </TextField>
            <label className={styles.field}>
              Role
              <select
                value={memberRole}
                onChange={(e) => {
                  const next = e.target.value as FamilyRole;
                  setMemberRole(next);
                  setCreateSpace(next !== "grandparent");
                }}
              >
                <option value="admin">Parent</option>
                <option value="grandparent">Grandparent — sees every space</option>
                <option value="member">Child — General and their space only</option>
              </select>
            </label>
            {memberRole !== "grandparent" ? (
              <Checkbox isSelected={createSpace} onChange={setCreateSpace}>
                Give them their own space
              </Checkbox>
            ) : null}
            <Button type="submit" className={styles.primary} isDisabled={submitting}>
              Send invitation
            </Button>
          </Form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}