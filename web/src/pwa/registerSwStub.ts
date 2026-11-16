import { useState } from "react";

/** Vitest stand-in. The production module is virtual:pwa-register/react. */
export function useRegisterSW() {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: () => Promise.resolve(),
  };
}
