export type SignedUpload = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export type SignedView = {
  url: string;
  expiresAt: string;
};

export interface MediaStore {
  signUpload(
    key: string,
    contentType: "image/jpeg",
    bytes: number,
  ): Promise<SignedUpload>;
  signViews(
    keys: string[],
    ttlSeconds: number,
  ): Promise<Record<string, SignedView>>;
  head(key: string): Promise<{ bytes: number; contentType: string } | null>;
  remove(keys: string[]): Promise<void>;
}

export type StorageBucket = {
  createSignedUploadUrl(
    path: string,
    options?: { upsert?: boolean },
  ): Promise<{
    data: { signedUrl: string } | null;
    error: { message: string } | null;
  }>;
  createSignedUrls(
    paths: string[],
    expiresIn: number,
  ): Promise<{
    data: Array<{ path: string | null; signedUrl: string | null; error: string | null }> | null;
    error: { message: string } | null;
  }>;
  info(path: string): Promise<{
    data: { size?: number; contentType?: string; metadata?: Record<string, unknown> } | null;
    error: { message: string } | null;
  }>;
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
};
