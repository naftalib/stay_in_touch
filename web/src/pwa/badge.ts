import { useEffect } from "react";

export function useAppBadge(total: number) {
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (total > 0) void nav.setAppBadge?.(total);
    else void nav.clearAppBadge?.();
  }, [total]);
}
