import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys.ts";
import { VIEW_URL_STALE_MS, viewUrlNeedsRefresh } from "./altText.ts";
import { fetchViewUrls, type ViewLink } from "./upload.ts";

export function useMediaViews(mediaIds: string[]) {
  const ids = [...new Set(mediaIds)].sort();
  return useQuery({
    queryKey: queryKeys.mediaViews(ids),
    queryFn: () => fetchViewUrls(ids),
    enabled: ids.length > 0,
    // Signed GETs from storage-api omit Cache-Control. They send Expires at the
    // token's end, so the browser caches a reused URL until then. A new URL is
    // a new cache entry, which is why this query keeps the same URL until the
    // last 10 minutes.
    staleTime: VIEW_URL_STALE_MS,
    refetchInterval: (query) => {
      const data = query.state.data as Record<string, ViewLink> | undefined;
      if (!data) return false;
      const soon = Object.values(data).some((link) => viewUrlNeedsRefresh(link.expiresAt));
      return soon ? 60_000 : false;
    },
  });
}
