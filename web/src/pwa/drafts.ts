const PREFIX = "sit-draft:";

export function draftStorageKey(userId: string, spaceId: string): string {
  return `${PREFIX}${userId}:${spaceId}`;
}

export function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeDraft(key: string, text: string): void {
  try {
    if (text.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, text);
  } catch {
    // A full or blocked store must not stop typing.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function clearAllDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const flushers = new Set<() => void>();

export function registerDraftFlush(flush: () => void): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

export function flushDrafts(): void {
  for (const flush of flushers) flush();
}
