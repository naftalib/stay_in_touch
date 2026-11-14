import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSupabase } from "../lib/supabase.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import { removeMessageFromCache, replaceNewestPage, upsertMessageInCache } from "./cache.ts";
import { fetchMessagesByIds, fetchMessagesPage } from "./fetchMessagesPage.ts";

/** Fields the client is allowed to read from a broadcast. Everything else is ignored. */
type BroadcastRecord = {
  id?: string;
  space_id?: string;
};

type BroadcastBody = {
  table?: string;
  record?: BroadcastRecord;
  old_record?: BroadcastRecord;
};

function noticeFrom(body: BroadcastBody): {
  id: string;
  spaceId: string | null;
  table: string | null;
} | null {
  const id = body.record?.id ?? body.old_record?.id;
  if (!id) return null;
  return {
    id,
    spaceId: body.record?.space_id ?? body.old_record?.space_id ?? null,
    table: body.table ?? null,
  };
}

async function refetchNewest(queryClient: QueryClient, spaceId: string) {
  const page = await fetchMessagesPage(spaceId);
  replaceNewestPage(queryClient, spaceId, page);
}

/**
 * Subscribe to broadcast notices for every viewable space in a family.
 * Refetches message rows by id under RLS. Never renders payload fields.
 */
export function useSpaceChannels(
  familyId: string,
  spaceIds: string[],
  openSpaceId: string | undefined,
): void {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const pendingRef = useRef<Map<string, Set<string>>>(new Map());
  const timerRef = useRef<number | null>(null);
  const unreadDebounceRef = useRef<number | null>(null);
  const spaceIdsKey = spaceIds.join(",");

  useEffect(() => {
    if (!familyId || spaceIds.length === 0) return;

    const supabase = getSupabase();
    const allowed = new Set(spaceIds);
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];
    let sawDrop = false;

    const flush = async () => {
      const pending = pendingRef.current;
      pendingRef.current = new Map();
      for (const [spaceId, ids] of pending) {
        const list = [...ids];
        const rows = await fetchMessagesByIds(list);
        const fetched = new Set(rows.map((row) => row.id));
        for (const row of rows) {
          upsertMessageInCache(queryClient, row.space_id, row);
        }
        for (const id of list) {
          if (!fetched.has(id)) {
            removeMessageFromCache(queryClient, spaceId, id);
          }
        }
      }
    };

    const scheduleFlush = () => {
      if (timerRef.current != null) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, 100);
    };

    const scheduleUnread = () => {
      if (unreadDebounceRef.current != null) return;
      unreadDebounceRef.current = window.setTimeout(() => {
        unreadDebounceRef.current = null;
        void queryClient.invalidateQueries({
          queryKey: queryKeys.unread(familyId),
        });
      }, 300);
    };

    const catchUp = () => {
      if (openSpaceId && allowed.has(openSpaceId)) {
        void refetchNewest(queryClient, openSpaceId);
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.unread(familyId),
      });
    };

    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      catchUp();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", catchUp);

    void (async () => {
      await supabase.realtime.setAuth(session?.access_token);
      if (cancelled) return;

      for (const spaceId of spaceIds) {
        if (cancelled) return;
        const topic = `space:${spaceId}`;

        const handle = (payload: { payload?: BroadcastBody }) => {
          const body = payload.payload ?? {};
          const notice = noticeFrom(body);
          if (!notice) return;
          if (notice.table && notice.table !== "messages") {
            scheduleUnread();
            return;
          }
          const target = notice.spaceId ?? spaceId;
          if (!allowed.has(target)) return;

          let set = pendingRef.current.get(target);
          if (!set) {
            set = new Set();
            pendingRef.current.set(target, set);
          }
          set.add(notice.id);
          scheduleFlush();
          scheduleUnread();
        };

        const channel = supabase
          .channel(topic, { config: { private: true } })
          .on("broadcast", { event: "INSERT" }, handle)
          .on("broadcast", { event: "UPDATE" }, handle)
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              sawDrop = true;
              return;
            }
            if (status === "SUBSCRIBED" && sawDrop) {
              sawDrop = false;
              catchUp();
            }
          });
        channels.push(channel);
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", catchUp);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      if (unreadDebounceRef.current != null) {
        window.clearTimeout(unreadDebounceRef.current);
      }
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [familyId, openSpaceId, queryClient, session?.access_token, spaceIds, spaceIdsKey]);
}
