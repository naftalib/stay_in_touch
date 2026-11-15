export type ThreadPhoto = {
  id: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  deletedAt: string | null;
  uploaderMemberId: string;
  uploaderLabel: string;
  createdAt: string;
  status: "pending" | "ready" | "failed";
};

export type PhotosPage = {
  items: ThreadPhoto[];
  nextCursor: { createdAt: string; id: string } | null;
};
