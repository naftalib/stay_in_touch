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
}): boolean {
  return input.needRefresh && !input.composing && !input.dismissed;
}
