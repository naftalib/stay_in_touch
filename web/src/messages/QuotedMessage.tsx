import { useQuery } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { queryKeys } from "../lib/queryKeys.ts";
import { fetchMessageById } from "./fetchMessagesPage.ts";
import type { ThreadMessage } from "./types.ts";
import styles from "./QuotedMessage.module.css";

type QuotedMessageProps = {
  replyToId: string;
  loaded?: ThreadMessage | null;
  onActivate: () => void;
};

export default function QuotedMessage({ replyToId, loaded, onActivate }: QuotedMessageProps) {
  const query = useQuery({
    queryKey: queryKeys.message(replyToId),
    queryFn: () => fetchMessageById(replyToId),
    enabled: loaded == null,
  });

  const quote = loaded ?? query.data ?? null;
  const unavailable = !quote || quote.deleted_at !== null;
  const label = unavailable
    ? "Original message unavailable"
    : `${quote.authorLabel}: ${firstLine(quote.body)}`;

  return (
    <Button className={styles.quote} onPress={onActivate}>
      {query.isLoading && loaded == null ? "Loading original message…" : label}
    </Button>
  );
}

function firstLine(body: string): string {
  const line = body.split("\n")[0] ?? body;
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}
