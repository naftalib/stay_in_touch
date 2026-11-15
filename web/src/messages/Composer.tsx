import { useEffect, useRef, useState } from "react";
import {
  Button,
  FieldError,
  FileTrigger,
  Form,
  Label,
  TextArea,
  TextField,
} from "react-aria-components";
import { mapError, type AppError } from "../lib/errors.ts";
import { getSupabase } from "../lib/supabase.ts";
import ConfirmDialog from "../ui/ConfirmDialog.tsx";
import { preparePhoto } from "../media/preparePhoto.ts";
import {
  MAX_PHOTOS_PER_POST,
  sendGate,
  tooManyPhotos,
  type PhotoDraft,
} from "../media/photoDraft.ts";
import { finishUpload, putBlob, reserveUpload } from "../media/upload.ts";
import type { ThreadMessage } from "./types.ts";
import styles from "./Composer.module.css";

const MAX_LENGTH = 4000;

type ComposerProps = {
  spaceId?: string;
  disabled?: boolean;
  disabledReason?: string;
  offline?: boolean;
  replyTo?: ThreadMessage | null;
  onCancelReply?: () => void;
  onSend: (body: string, replyToId?: string | null) => Promise<void>;
  onSendPhotos?: (body: string, mediaIds: string[], replyToId?: string | null) => Promise<void>;
};

export default function Composer({
  spaceId,
  disabled,
  disabledReason,
  offline,
  replyTo,
  onCancelReply,
  onSend,
  onSendPhotos,
}: ComposerProps) {
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const filesRef = useRef(new Map<string, File>());
  const effectiveDisabled = disabled || offline;
  const gate = sendGate(body, photos);
  const busy = photos.some((photo) => photo.phase === "preparing" || photo.phase === "uploading");

  useEffect(() => {
    if (!replyTo) return;
    document.querySelector<HTMLTextAreaElement>("[data-composer-input]")?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a");
      const href = anchor?.getAttribute("href");
      if (!anchor || !href || href.startsWith("#")) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(href);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [busy]);

  function patch(localId: string, next: Partial<PhotoDraft>) {
    setPhotos((current) =>
      current.map((photo) => (photo.localId === localId ? { ...photo, ...next } : photo)),
    );
  }

  async function uploadOne(localId: string, file: File) {
    patch(localId, { phase: "preparing", progress: 0, error: undefined });
    try {
      const prepared = await preparePhoto(file);
      patch(localId, {
        previewUrl: prepared.previewUrl,
        width: prepared.width,
        height: prepared.height,
        phase: "uploading",
        progress: 0.05,
      });
      if (!spaceId) throw new Error("Choose a space before adding photos.");
      const reserved = await reserveUpload({
        spaceId,
        bytes: prepared.full.size,
        thumbBytes: prepared.thumb.size,
        width: prepared.width,
        height: prepared.height,
      });
      patch(localId, { mediaId: reserved.media_id });
      await putBlob(reserved.upload, prepared.full, (ratio) =>
        patch(localId, { progress: ratio * 0.7 }),
      );
      await putBlob(reserved.thumb, prepared.thumb, (ratio) =>
        patch(localId, { progress: 0.7 + ratio * 0.25 }),
      );
      const status = await finishUpload(reserved.media_id);
      if (status !== "ready") throw new Error("The photo could not be saved. Try again.");
      patch(localId, { phase: "ready", progress: 1 });
    } catch (caught) {
      patch(localId, { phase: "failed", error: mapError(caught).title });
    }
  }

  async function addFiles(list: File[]) {
    const limit = tooManyPhotos(photos.length, list.length);
    if (limit) {
      setError({ title: limit });
      return;
    }
    setError(null);
    const drafts: PhotoDraft[] = list.map((file) => {
      const localId = crypto.randomUUID();
      filesRef.current.set(localId, file);
      return { localId, phase: "preparing", progress: 0, previewUrl: "", caption: "" };
    });
    setPhotos((current) => [...current, ...drafts]);
    for (const draft of drafts) {
      const file = filesRef.current.get(draft.localId);
      if (file) await uploadOne(draft.localId, file);
    }
  }

  async function saveCaption(photo: PhotoDraft) {
    if (!photo.mediaId) return;
    const caption = photo.caption.trim();
    const { error: updateError } = await getSupabase()
      .from("media")
      .update({ caption: caption || null })
      .eq("id", photo.mediaId);
    if (updateError) throw updateError;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (effectiveDisabled || !gate.enabled) return;
    const trimmed = body.trim();
    const ready = photos.filter((photo) => photo.phase === "ready" && photo.mediaId);
    setSubmitting(true);
    setError(null);
    try {
      if (ready.length > 0) {
        if (!onSendPhotos) throw new Error("Photos can't be posted from here.");
        for (const photo of ready) await saveCaption(photo);
        await onSendPhotos(
          trimmed,
          ready.map((photo) => photo.mediaId as string),
          replyTo?.id ?? null,
        );
        for (const photo of photos) {
          if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
        }
        setPhotos([]);
        filesRef.current.clear();
      } else {
        await onSend(trimmed, replyTo?.id ?? null);
      }
      setBody("");
      onCancelReply?.();
    } catch (caught) {
      setError(mapError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (effectiveDisabled) {
    return (
      <footer className={styles.footer}>
        <p className={styles.disabled} role="status">
          {offline
            ? "You're offline. Sending is disabled until you're back online."
            : (disabledReason ?? "This space is read-only.")}
        </p>
      </footer>
    );
  }

  return (
    <footer className={styles.footer}>
      {replyTo ? <FormReplyBar replyTo={replyTo} onCancel={onCancelReply} /> : null}
      {spaceId ? (
        <div className={styles.toolbar}>
          <FileTrigger
            acceptedFileTypes={[
              "image/jpeg",
              "image/png",
              "image/heic",
              "image/heif",
              ".heic",
              ".heif",
            ]}
            allowsMultiple
            onSelect={(list) => {
              if (list) void addFiles([...list]);
            }}
          >
            <Button type="button" className={styles.addPhotos}>
              Add photos
            </Button>
          </FileTrigger>
        </div>
      ) : null}
      {photos.length > 0 ? (
        <ul className={styles.previews}>
          {photos.map((photo) => (
            <li key={photo.localId} className={styles.preview}>
              {photo.previewUrl ? (
                <img src={photo.previewUrl} alt={photo.caption.trim() || "Photo preview"} />
              ) : (
                <span>Preparing…</span>
              )}
              {photo.phase === "preparing" || photo.phase === "uploading" ? (
                <div
                  role="progressbar"
                  aria-label="Uploading photo"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(photo.progress * 100)}
                >
                  {photo.phase === "preparing" ? "Preparing" : "Uploading"}
                </div>
              ) : null}
              {photo.phase === "failed" ? (
                <p role="alert">
                  {photo.error ?? "Upload failed."}{" "}
                  <Button
                    type="button"
                    className={styles.retry}
                    onPress={() => {
                      const file = filesRef.current.get(photo.localId);
                      if (file) void uploadOne(photo.localId, file);
                    }}
                  >
                    Retry
                  </Button>
                  <Button
                    type="button"
                    className={styles.retry}
                    onPress={() => {
                      filesRef.current.delete(photo.localId);
                      setPhotos((current) =>
                        current.filter((item) => item.localId !== photo.localId),
                      );
                    }}
                  >
                    Remove
                  </Button>
                </p>
              ) : null}
              <label>
                Caption
                <input
                  value={photo.caption}
                  maxLength={200}
                  onChange={(event) => patch(photo.localId, { caption: event.target.value })}
                />
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <Form className={styles.form} onSubmit={handleSubmit}>
        <TextField
          name="message"
          isRequired={!photos.some((photo) => photo.phase === "ready")}
          value={body}
          onChange={setBody}
          maxLength={MAX_LENGTH}
          className={styles.field}
        >
          <Label className="sr-only">Message</Label>
          <TextArea
            data-composer-input
            className={styles.input}
            placeholder="Write a message…"
            disabled={submitting}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={3}
          />
          <FieldError className={styles.fieldError} />
        </TextField>
        {body.length > MAX_LENGTH - 200 ? (
          <p className={styles.counter} aria-live="polite">
            {MAX_LENGTH - body.length} characters left
          </p>
        ) : null}
        <Button type="submit" className={styles.button} isDisabled={submitting || !gate.enabled}>
          Send
        </Button>
      </Form>
      {photos.length >= MAX_PHOTOS_PER_POST ? (
        <p role="status">You can add up to 10 photos on one message.</p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error.title}
        </p>
      ) : null}
      <ConfirmDialog
        request={
          leaveTo
            ? {
                title: "Photos are still uploading",
                body: "Leave this page? The upload in progress will stop.",
                confirmLabel: "Leave",
              }
            : null
        }
        onClose={(confirmed) => {
          const href = leaveTo;
          setLeaveTo(null);
          if (confirmed && href) window.location.assign(href);
        }}
      />
    </footer>
  );
}

function FormReplyBar({ replyTo, onCancel }: { replyTo: ThreadMessage; onCancel?: () => void }) {
  return (
    <div className={styles.replyBanner}>
      <span>
        Replying to {replyTo.authorLabel}: {(replyTo.body.split("\n")[0] ?? "").slice(0, 60)}
      </span>
      {onCancel ? (
        <Button type="button" className={styles.cancelReply} onPress={onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
