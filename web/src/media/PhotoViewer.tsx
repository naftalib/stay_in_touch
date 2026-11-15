import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import type { FamilyRole } from "../lib/database.helpers.ts";
import { getSupabase } from "../lib/supabase.ts";
import { photoAlt } from "./altText.ts";
import type { ThreadPhoto } from "./types.ts";
import styles from "./PhotoViewer.module.css";

type PhotoViewerProps = {
  photos: ThreadPhoto[];
  startId: string;
  links: Record<string, { full: string } | undefined>;
  memberId: string;
  role: FamilyRole;
  onClose: () => void;
  onChanged: () => void;
};

export default function PhotoViewer({
  photos,
  startId,
  links,
  memberId,
  role,
  onClose,
  onChanged,
}: PhotoViewerProps) {
  const opener = useRef<HTMLElement | null>(null);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      photos.findIndex((photo) => photo.id === startId),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const photo = photos[index];

  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => opener.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight")
        setIndex((current) => Math.min(photos.length - 1, current + 1));
      if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length]);

  if (!photo) return null;
  const dateLabel = new Date(photo.createdAt).toLocaleDateString();
  const canDelete =
    photo.deletedAt === null && (photo.uploaderMemberId === memberId || role === "admin");
  const canRestore = photo.deletedAt !== null && role === "admin";

  async function changeDeleted(deleted: boolean) {
    setError(null);
    const { error: updateError } = await getSupabase()
      .from("media")
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq("id", photo.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged();
  }

  return (
    <ModalOverlay
      isOpen
      isDismissable
      className={styles.overlay}
      onOpenChange={(open) => !open && onClose()}
    >
      <Modal className={styles.modal}>
        <Dialog className={styles.dialog} aria-label="Photo">
          <Heading slot="title" className="sr-only">
            Photo
          </Heading>
          <div
            className={styles.stage}
            onPointerDown={(event) => {
              const startX = event.clientX;
              event.currentTarget.setPointerCapture(event.pointerId);
              event.currentTarget.dataset.startX = String(startX);
            }}
            onPointerUp={(event) => {
              const startX = Number(event.currentTarget.dataset.startX ?? event.clientX);
              const delta = event.clientX - startX;
              if (delta > 48) setIndex((current) => Math.max(0, current - 1));
              if (delta < -48) setIndex((current) => Math.min(photos.length - 1, current + 1));
            }}
          >
            {photo.deletedAt ? (
              <p className={styles.deleted}>This photo was deleted.</p>
            ) : links[photo.id]?.full ? (
              <img
                className={styles.full}
                src={links[photo.id]?.full}
                alt={photoAlt(photo.caption, photo.uploaderLabel, dateLabel)}
              />
            ) : (
              <p role="status">Loading photo…</p>
            )}
          </div>
          <div className={styles.actions}>
            <Button
              className={styles.button}
              isDisabled={index === 0}
              onPress={() => setIndex((current) => current - 1)}
            >
              Previous
            </Button>
            <Button
              className={styles.button}
              isDisabled={index >= photos.length - 1}
              onPress={() => setIndex((current) => current + 1)}
            >
              Next
            </Button>
            {canDelete ? (
              <Button className={styles.button} onPress={() => void changeDeleted(true)}>
                Delete photo
              </Button>
            ) : null}
            {canRestore ? (
              <Button className={styles.button} onPress={() => void changeDeleted(false)}>
                Restore photo
              </Button>
            ) : null}
            <Button className={styles.button} onPress={onClose}>
              Close
            </Button>
          </div>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
