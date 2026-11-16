import { useEffect, useState } from "react";
import { Button } from "react-aria-components";
import { useRegisterSW } from "virtual:pwa-register/react";
import { shouldOfferUpdate, useComposeActive } from "./composeActivity.ts";
import { flushDrafts } from "./drafts.ts";
import { UPDATE_LATER_KEY } from "./pushClient.ts";
import styles from "./PwaChrome.module.css";

let watchingUpdates = false;

export default function UpdatePrompt() {
  const composing = useComposeActive();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(UPDATE_LATER_KEY) === "1",
  );
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedReload() {
      // Reload once from controllerchange so a second path cannot also reload.
    },
    onRegisteredSW(_url, registration) {
      if (!registration || watchingUpdates) return;
      watchingUpdates = true;
      const update = () => {
        void registration.update().catch(() => undefined);
      };
      update();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") update();
      });
      window.setInterval(update, 60 * 60 * 1000);
    },
    onRegisterError() {
      // The app still works without a worker. Dev leaves the worker off.
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    const onChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onChange);
    return () => navigator.serviceWorker?.removeEventListener("controllerchange", onChange);
  }, [needRefresh]);

  if (!shouldOfferUpdate({ needRefresh, composing, dismissed })) return null;

  return (
    <div className={styles.sheet} role="status">
      <p>A new version of Stay In Touch is ready.</p>
      <div className={styles.actions}>
        <Button
          onPress={() => {
            flushDrafts();
            void updateServiceWorker(false);
          }}
        >
          Update now
        </Button>
        <Button
          onPress={() => {
            sessionStorage.setItem(UPDATE_LATER_KEY, "1");
            setDismissed(true);
          }}
        >
          Later
        </Button>
      </div>
    </div>
  );
}
