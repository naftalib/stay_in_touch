export type PhotoPhase = "preparing" | "uploading" | "ready" | "failed";

export type PhotoDraft = {
  localId: string;
  phase: PhotoPhase;
  progress: number;
  error?: string;
  mediaId?: string;
  previewUrl: string;
  caption: string;
  width?: number;
  height?: number;
};

export const MAX_PHOTOS_PER_POST = 10;

export function tooManyPhotos(existing: number, adding: number): string | null {
  if (existing + adding > MAX_PHOTOS_PER_POST) {
    return "You can add up to 10 photos on one message.";
  }
  return null;
}

export function sendGate(
  body: string,
  photos: PhotoDraft[],
): { enabled: boolean; reason?: string } {
  if (photos.some((photo) => photo.phase === "preparing" || photo.phase === "uploading")) {
    return { enabled: false, reason: "Wait until each photo finishes uploading." };
  }
  const ready = photos.some((photo) => photo.phase === "ready");
  if (!body.trim() && !ready) return { enabled: false };
  return { enabled: true };
}
