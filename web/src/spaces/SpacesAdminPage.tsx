import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Form, Input, Label, TextField } from "react-aria-components";
import { useFamily } from "../family/FamilyProvider.tsx";
import { useSpaces } from "../family/useSpaces.ts";
import { useAllMembers } from "../family/useAllMembers.ts";
import { getSupabase } from "../lib/supabase.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import { mapError, type AppError } from "../lib/errors.ts";
import ConfirmDialog, { type ConfirmRequest } from "../ui/ConfirmDialog.tsx";
import styles from "./SpacesAdminPage.module.css";

export default function SpacesAdminPage() {
  const { role, familyId } = useFamily();
  const spacesQuery = useSpaces(familyId);
  const membersQuery = useAllMembers(familyId, role === "admin");
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [confirm, setConfirm] = useState<(ConfirmRequest & { run: () => Promise<void> }) | null>(
    null,
  );

  const ownerLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of membersQuery.data ?? []) {
      map.set(member.id, member.label);
    }
    return map;
  }, [membersQuery.data]);

  if (role !== "admin") {
    return (
      <main className={styles.page}>
        <h1>Only parents can manage the family</h1>
      </main>
    );
  }

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.spaces(familyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members(familyId) }),
    ]);
  }

  async function rename(spaceId: string, title: string) {
    setError(null);
    const { error: rpcError } = await getSupabase().rpc("rename_space", {
      p_space_id: spaceId,
      p_title: title,
    });
    if (rpcError) {
      setError(mapError(rpcError));
      return;
    }
    setMessage("Space renamed.");
    await invalidate();
  }

  async function archive(spaceId: string) {
    const { error: rpcError } = await getSupabase().rpc("archive_space", { p_space_id: spaceId });
    if (rpcError) {
      setError(mapError(rpcError));
      return;
    }
    setMessage("Space archived.");
    await invalidate();
  }

  async function unarchive(spaceId: string) {
    const { error: rpcError } = await getSupabase().rpc("unarchive_space", { p_space_id: spaceId });
    if (rpcError) {
      setError(mapError(rpcError));
      return;
    }
    setMessage("Space restored.");
    await invalidate();
  }

  async function createSpace(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMember || !newTitle.trim()) return;
    setError(null);
    const { error: rpcError } = await getSupabase().rpc("create_member_space", {
      p_family_id: familyId,
      p_owner_member_id: selectedMember,
      p_title: newTitle.trim(),
    });
    if (rpcError) {
      setError(mapError(rpcError));
      return;
    }
    setNewTitle("");
    setSelectedMember("");
    setMessage("Space created.");
    await invalidate();
  }

  const membersWithoutSpace = (membersQuery.data ?? []).filter(
    (m) =>
      m.status === "active" &&
      m.role !== "grandparent" &&
      !(spacesQuery.data ?? []).some((s) => s.owner_member_id === m.id),
  );

  return (
    <main className={styles.page}>
      <h1>Family spaces</h1>
      {message ? (
        <p role="status" className={styles.status}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error.title}
        </p>
      ) : null}

      <ul className={styles.list}>
        {(spacesQuery.data ?? []).map((space) => (
          <li key={space.id} className={styles.row}>
            <RenameSpaceTitle spaceId={space.id} title={space.title} onSave={rename} archived={Boolean(space.archived_at)} />
            <p className={styles.meta}>
              {space.kind === "general"
                ? "General"
                : `Owner: ${ownerLabels.get(space.owner_member_id ?? "") ?? "—"}`}
              {space.archived_at ? " · Archived" : ""}
            </p>
            <div className={styles.rowActions}>
              {space.archived_at ? (
                <Button
                  onPress={() =>
                    setConfirm({
                      title: `Restore ${space.title}?`,
                      body: "People will be able to post in this space again.",
                      confirmLabel: "Unarchive",
                      run: () => unarchive(space.id),
                    })
                  }
                >
                  Unarchive
                </Button>
              ) : space.kind !== "general" ? (
                <Button
                  onPress={() =>
                    setConfirm({
                      title: `Archive ${space.title}?`,
                      body: "Members can still read it. New posts are blocked.",
                      confirmLabel: "Archive",
                      run: () => archive(space.id),
                    })
                  }
                >
                  Archive
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {membersWithoutSpace.length > 0 ? (
        <section className={styles.create}>
          <h2>Create a space</h2>
          <Form
            onSubmit={(e) => {
              void createSpace(e);
            }}
          >
            <label className={styles.field}>
              Member
              <select value={selectedMember} onChange={(ev) => setSelectedMember(ev.target.value)}>
                <option value="">Choose…</option>
                {membersWithoutSpace.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <TextField isRequired value={newTitle} onChange={setNewTitle} className={styles.field}>
              <Label>Space title</Label>
              <Input />
            </TextField>
            <Button type="submit" className={styles.primary}>
              Create space
            </Button>
          </Form>
        </section>
      ) : null}
      <ConfirmDialog
        request={confirm}
        onClose={(confirmed) => {
          const run = confirm?.run;
          setConfirm(null);
          if (confirmed && run) void run();
        }}
      />
    </main>
  );
}

function RenameSpaceTitle({
  spaceId,
  title,
  onSave,
  archived,
}: {
  spaceId: string;
  title: string;
  onSave: (id: string, title: string) => Promise<void>;
  archived: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  if (!editing) {
    return (
      <div className={styles.titleRow}>
        <h2>{title}</h2>
        {!archived ? (
          <Button onPress={() => setEditing(true)}>Rename</Button>
        ) : (
          <span className={styles.disabledHint}>Archived spaces cannot be renamed.</span>
        )}
      </div>
    );
  }
  return (
    <Form
      className={styles.renameForm}
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(spaceId, value).then(() => setEditing(false));
      }}
    >
      <TextField isRequired value={value} onChange={setValue}>
        <Label className="sr-only">Title</Label>
        <Input />
      </TextField>
      <Button type="submit">Save</Button>
      <Button type="button" onPress={() => setEditing(false)}>
        Cancel
      </Button>
    </Form>
  );
}