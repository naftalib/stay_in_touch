export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function currentInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const INSTALL_DISMISS_KEY = "sit-install-dismissed";

export function reopenInstallCard(): void {
  localStorage.removeItem(INSTALL_DISMISS_KEY);
  window.dispatchEvent(new Event("sit-install-reopen"));
}

export function clearInstallPrompt(): void {
  deferred = null;
  notify();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}
