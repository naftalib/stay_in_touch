import { getSupabase } from "../lib/supabase.ts";
import { olderThanFilter } from "../messages/cache.ts";
import type { PhotosPage, ThreadPhoto } from "./types.ts";

const PAGE_SIZE = 30;

const PHOTO_COLS =
  "id, message_id, caption, width, height, deleted_at, uploader_member_id, created_at, status, space_id" as const;

type PhotoRow = {
  id: string;
  message_id: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  deleted_at: string | null;
  uploader_member_id: string;
  created_at: string;
  status: "pending" | "ready" | "failed";
  space_id: string;
};

async function labelsFor(memberIds: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (memberIds.length === 0) return labels;
  const { data, error } = await getSupabase()
    .from("family_members")
    .select("id, label")
    .in("id", memberIds);
  if (error) throw error;
  for (const member of data ?? []) labels.set(member.id, member.label);
  return labels;
}

function toPhoto(row: PhotoRow, labels: Map<string, string>): ThreadPhoto {
  return {
    id: row.id,
    caption: row.caption,
    width: row.width,
    height: row.height,
    deletedAt: row.deleted_at,
    uploaderMemberId: row.uploader_member_id,
    uploaderLabel: labels.get(row.uploader_member_id) ?? "Family member",
    createdAt: row.created_at,
    status: row.status,
  };
}

export async function fetchPhotosForMessages(
  messageIds: string[],
): Promise<Map<string, ThreadPhoto[]>> {
  const grouped = new Map<string, ThreadPhoto[]>();
  if (messageIds.length === 0) return grouped;
  const { data, error } = await getSupabase()
    .from("media")
    .select(PHOTO_COLS)
    .in("message_id", messageIds)
    .eq("kind", "photo")
    .eq("status", "ready");
  if (error) throw error;
  const rows = (data ?? []) as PhotoRow[];
  const labels = await labelsFor([...new Set(rows.map((row) => row.uploader_member_id))]);
  for (const row of rows) {
    if (!row.message_id) continue;
    const list = grouped.get(row.message_id) ?? [];
    list.push(toPhoto(row, labels));
    grouped.set(row.message_id, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  return grouped;
}

export async function fetchPhotosPage(
  spaceId: string,
  cursor?: { createdAt: string; id: string },
): Promise<PhotosPage> {
  let query = getSupabase()
    .from("media")
    .select(PHOTO_COLS)
    .eq("space_id", spaceId)
    .eq("kind", "photo")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);
  if (cursor) query = query.or(olderThanFilter(cursor));
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as PhotoRow[];
  const labels = await labelsFor([...new Set(rows.map((row) => row.uploader_member_id))]);
  const items = rows.map((row) => toPhoto(row, labels));
  const oldest = items.at(-1);
  return {
    items,
    nextCursor:
      items.length === PAGE_SIZE && oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
  };
}
