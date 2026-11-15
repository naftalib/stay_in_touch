import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import type { FamilyRole } from "../lib/database.helpers.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import { photoAlt } from "./altText.ts";
import { fetchPhotosPage } from "./fetchPhotos.ts";
import PhotoViewer from "./PhotoViewer.tsx";
import { useMediaViews } from "./useMediaViews.ts";
import styles from "./PicsTab.module.css";

type PicsTabProps = {
  spaceId: string;
  memberId: string;
  role: FamilyRole;
};

export default function PicsTab({ spaceId, memberId, role }: PicsTabProps) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: queryKeys.photos(spaceId),
    initialPageParam: undefined as { createdAt: string; id: string } | undefined,
    queryFn: ({ pageParam }) => fetchPhotosPage(spaceId, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const photos = query.data?.pages.flatMap((page) => page.items) ?? [];
  const views = useMediaViews(
    photos.filter((photo) => photo.deletedAt === null).map((photo) => photo.id),
  );

  if (query.isLoading) {
    return (
      <p className={styles.status} role="status" aria-busy="true">
        Loading photos…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p className={styles.status} role="alert">
        Could not load photos.{" "}
        <button type="button" className={styles.button} onClick={() => void query.refetch()}>
          Try again
        </button>
      </p>
    );
  }
  if (photos.length === 0) {
    return <p className={styles.status}>No photos in this space yet.</p>;
  }

  return (
    <section aria-label="Pics">
      <ul className={styles.grid}>
        {photos.map((photo) => {
          const dateLabel = new Date(photo.createdAt).toLocaleDateString();
          const alt = photo.deletedAt
            ? "Deleted photo"
            : photoAlt(photo.caption, photo.uploaderLabel, dateLabel);
          const thumb = views.data?.[photo.id]?.thumb;
          return (
            <li key={photo.id}>
              <Button
                className={styles.thumbButton}
                onPress={() => setOpenId(photo.id)}
                aria-label={thumb && !photo.deletedAt ? alt : undefined}
              >
                {photo.deletedAt ? (
                  <span>Deleted photo</span>
                ) : thumb ? (
                  <img
                    className={styles.thumb}
                    src={thumb}
                    alt=""
                    width={photo.width ?? undefined}
                    height={photo.height ?? undefined}
                  />
                ) : (
                  <span>{alt}</span>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
      {query.hasNextPage ? (
        <Button
          className={styles.button}
          onPress={() => void query.fetchNextPage()}
          isDisabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? "Loading more photos…" : "Load more photos"}
        </Button>
      ) : null}
      {openId ? (
        <PhotoViewer
          photos={photos}
          startId={openId}
          links={views.data ?? {}}
          memberId={memberId}
          role={role}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.photos(spaceId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.messages(spaceId) });
          }}
        />
      ) : null}
    </section>
  );
}
