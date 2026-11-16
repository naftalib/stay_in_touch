import { useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  shouldOfferUpdate,
  shouldReloadOnControllerChange,
  useComposeActive,
} from "./composeActivity.ts";
import { flushDrafts } from "./drafts.ts";
import { UPDATE_LATER_KEY } from "./pushClient.ts";
import styles from "./PwaChrome.module.css";

let watchingUpdates = false;

export default function UpdatePrompt() {
  const composing = useComposeActive();
  const reloadRequested = useRef(false);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(UPDATE_LATER_KEY) === "1",
  );
  const [newerVersion, setNewerVersion] = useState(false);
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
    const onChange = () => {
      if (!shouldReloadOnControllerChange(reloadRequested.current)) return;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onChange);
    return () => navigator.serviceWorker?.removeEventListener("controllerchange", onChange);
  }, []);

  useEffect(() => {
    if (!dismissed) return;
    let registration: ServiceWorkerRegistration | undefined;
    const onFound = () => setNewerVersion(true);
    void navigator.serviceWorker?.getRegistration().then((found) => {
      registration = found;
      registration?.addEventListener("updatefound", onFound);
    });
    return () => registration?.removeEventListener("updatefound", onFound);
  }, [dismissed]);

  if (!shouldOfferUpdate({ needRefresh, composing, dismissed, newerVersion })) return null;

  return (
    <div className={styles.sheet} role="status">
      <p>A new version of Stay In Touch is ready.</p>
      <div className={styles.actions}>
        <Button
          onPress={() => {
            reloadRequested.current = true;
            flushDrafts();
            void updateServiceWorker(false);
          }}
        >
          Update now
        </Button>
        <Button
          onPress={() => {
            sessionStorage.setItem(UPDATE_LATER_KEY, "1");
            setNewerVersion(false);
            setDismissed(true);
          }}
        >
          Later
        </Button>
      </div>
    </div>
  );
}
