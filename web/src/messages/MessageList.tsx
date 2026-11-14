import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import MessageItem, { type MessageItemProps } from "./MessageItem.tsx";
import type { ThreadMessage } from "./types.ts";
import styles from "./MessageList.module.css";

type MessageListProps = {
  messages: ThreadMessage[];
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onAtBottomChange?: (atBottom: boolean) => void;
  showNewMessagesButton: boolean;
  onJumpToNew: () => void;
  messageById: Map<string, ThreadMessage>;
  itemProps: Omit<MessageItemProps, "message" | "isOwn" | "quoteSource" | "archived" | "role"> & {
    role: MessageItemProps["role"];
    archived: boolean;
    offline?: boolean;
    memberId: string;
  };
};

export default function MessageList({
  messages,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onAtBottomChange,
  showNewMessagesButton,
  onJumpToNew,
  messageById,
  itemProps,
}: MessageListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickToEndRef = useRef(true);
  const anchorHeightRef = useRef<number | null>(null);

  const rows = useMemo(() => groupWithDaySeparators(messages), [messages]);

  useEffect(() => {
    if (!stickToEndRef.current) return;
    endRef.current?.scrollIntoView({ block: "end" });
    onAtBottomChange?.(true);
  }, [messages.length, onAtBottomChange]);

  function rememberAnchor() {
    const node = scrollerRef.current;
    if (!node || anchorHeightRef.current != null) return;
    anchorHeightRef.current = node.scrollHeight;
  }

  function handleScroll() {
    const node = scrollerRef.current;
    if (!node) return;

    const distanceFromEnd = node.scrollHeight - node.scrollTop - node.clientHeight;
    const atBottom = distanceFromEnd < 48;
    stickToEndRef.current = atBottom;
    onAtBottomChange?.(atBottom);

    if (node.scrollTop < 48 && hasOlder && !loadingOlder) {
      rememberAnchor();
      onLoadOlder();
    }
  }

  useLayoutEffect(() => {
    const node = scrollerRef.current;
    const before = anchorHeightRef.current;
    if (!node || before == null || loadingOlder) return;
    const delta = node.scrollHeight - before;
    if (delta !== 0) node.scrollTop += delta;
    anchorHeightRef.current = null;
  }, [loadingOlder, messages]);

  return (
    <div className={styles.wrapper}>
      {showNewMessagesButton ? (
        <button
          type="button"
          className={styles.newMessages}
          onClick={() => {
            stickToEndRef.current = true;
            onAtBottomChange?.(true);
            onJumpToNew();
          }}
        >
          New messages ↓
        </button>
      ) : null}

      <div
        className={styles.scroller}
        ref={scrollerRef}
        data-thread-scroller=""
        onScroll={handleScroll}
      >
        {hasOlder ? (
          <button
            type="button"
            className={styles.loadMore}
            onClick={() => {
              rememberAnchor();
              onLoadOlder();
            }}
            disabled={loadingOlder}
          >
            {loadingOlder ? "Loading older messages…" : "Load older messages"}
          </button>
        ) : (
          <p className={styles.start}>Beginning of the thread</p>
        )}

        <ol className={styles.list}>
          {rows.map((row) => {
            if (row.type === "day") {
              return (
                <li key={row.key} className={styles.dayItem}>
                  <span className={styles.daySep} role="separator">
                    {row.label}
                  </span>
                </li>
              );
            }
            const message = row.message;
            const isOwn = message.author_member_id === itemProps.memberId;
            return (
              <li key={message.id} id={`msg-${message.id}`} className={styles.item}>
                <MessageItem
                  message={message}
                  isOwn={isOwn}
                  role={itemProps.role}
                  archived={itemProps.archived}
                  offline={itemProps.offline}
                  quoteSource={message.reply_to_id ? messageById.get(message.reply_to_id) : null}
                  onReply={itemProps.onReply}
                  onEdit={itemProps.onEdit}
                  onDelete={itemProps.onDelete}
                  onScrollToQuote={itemProps.onScrollToQuote}
                  onRetry={itemProps.onRetry}
                  onRemoveFailed={itemProps.onRemoveFailed}
                />
              </li>
            );
          })}
        </ol>
        <div ref={endRef} />
      </div>
    </div>
  );
}

type Row =
  | { type: "day"; key: string; label: string }
  | { type: "message"; message: ThreadMessage };

function groupWithDaySeparators(messages: ThreadMessage[]): Row[] {
  const out: Row[] = [];
  let lastDay = "";
  for (const message of messages) {
    const dayKey = dayLabel(message.created_at);
    if (dayKey !== lastDay) {
      out.push({ type: "day", key: `day-${dayKey}`, label: dayKey });
      lastDay = dayKey;
    }
    out.push({ type: "message", message });
  }
  return out;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfMsg = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (startOfMsg.getTime() === startOfToday.getTime()) return "Today";
  if (startOfMsg.getTime() === startOfYesterday.getTime()) return "Yesterday";

  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}
