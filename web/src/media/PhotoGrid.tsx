import { useState } from "react";
import { Button } from "react-aria-components";
import { useQueryClient } from "@tanstack/react-query";
import type { FamilyRole } from "../lib/database.helpers.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import { photoAlt } from "./altText.ts";
import PhotoViewer from "./PhotoViewer.tsx";
import type { ThreadPhoto } from "./types.ts";
import { useMediaViews } from "./useMediaViews.ts";
import styles from "./PhotoGrid.module.css";

type PhotoGridProps = {
  photos: ThreadPhoto[];
  spaceId: string;
  memberId: string;
  role: FamilyRole;
};

export default function PhotoGrid({ photos, spaceId, memberId, role }: PhotoGridProps) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = photos.filter((photo) => photo.status === "ready");
  const views = useMediaViews(
    visible.filter((photo) => photo.deletedAt === null).map((photo) => photo.id),
  );
  const count = visible.length;
  const layout = count <= 1 ? styles.one : count === 2 ? styles.two : styles.many;

  if (count === 0) return null;

  return (
    <>
      <ul className={[styles.grid, layout].join(" ")}>
        {visible.map((photo) => {
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
                  <span className={styles.deleted}>Deleted photo</span>
                ) : thumb ? (
                  <img
                    className={styles.thumb}
                    src={thumb}
                    alt=""
                    width={photo.width ?? undefined}
                    height={photo.height ?? undefined}
                  />
                ) : (
                  <span className={styles.deleted}>{alt}</span>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
      {openId ? (
        <PhotoViewer
          photos={visible}
          startId={openId}
          links={views.data ?? {}}
          memberId={memberId}
          role={role}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.messages(spaceId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.photos(spaceId) });
          }}
        />
      ) : null}
    </>
  );
}
