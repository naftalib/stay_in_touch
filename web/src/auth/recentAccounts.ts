export type RecentAccount = {
  email: string;
  displayName: string;
};

const STORAGE_KEY = "stay-recent-accounts";
const MAX = 5;

export function loadRecentAccounts(): RecentAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentAccount[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => typeof row.email === "string");
  } catch {
    return [];
  }
}

export function rememberRecentAccount(entry: RecentAccount): void {
  const existing = loadRecentAccounts().filter(
    (row) => row.email.toLowerCase() !== entry.email.toLowerCase(),
  );
  const next = [entry, ...existing].slice(0, MAX);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function removeRecentAccount(email: string): void {
  const next = loadRecentAccounts().filter(
    (row) => row.email.toLowerCase() !== email.toLowerCase(),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}