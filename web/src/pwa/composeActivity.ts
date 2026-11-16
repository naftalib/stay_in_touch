import { useSyncExternalStore } from "react";

let active = false;
const listeners = new Set<() => void>();

export function setComposeActive(next: boolean): void {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useComposeActive(): boolean {
  return useSyncExternalStore(subscribe, () => active, () => false);
}

export function shouldOfferUpdate(input: {
  needRefresh: boolean;
  composing: boolean;
  dismissed: boolean;
  newerVersion?: boolean;
}): boolean {
  const hidden = input.dismissed && !input.newerVersion;
  return input.needRefresh && !input.composing && !hidden;
}

/** Another tab's update claims this page too. Reload only after this tab asked. */
export function shouldReloadOnControllerChange(requestedByThisTab: boolean): boolean {
  return requestedByThisTab;
}
