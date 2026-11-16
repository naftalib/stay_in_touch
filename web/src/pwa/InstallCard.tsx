import { useEffect, useState } from "react";
import { Button } from "react-aria-components";
import { installView } from "./installState.ts";
import {
  clearInstallPrompt,
  currentInstallPrompt,
  INSTALL_DISMISS_KEY,
  subscribeInstallPrompt,
} from "./installPrompt.ts";
import { browserInstalled } from "./pushClient.ts";
import styles from "./PwaChrome.module.css";

export default function InstallCard() {
  const [hasPrompt, setHasPrompt] = useState(() => currentInstallPrompt() !== null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(INSTALL_DISMISS_KEY) === "1",
  );
  const [installed, setInstalled] = useState(() => browserInstalled());

  useEffect(() => subscribeInstallPrompt(() => setHasPrompt(currentInstallPrompt() !== null)), []);
  useEffect(() => {
    const reopen = () => setDismissed(localStorage.getItem(INSTALL_DISMISS_KEY) === "1");
    window.addEventListener("sit-install-reopen", reopen);
    return () => window.removeEventListener("sit-install-reopen", reopen);
  }, []);

  const view = installView({ installed, dismissed, hasPrompt });
  if (view === "hidden") return null;

  return (
    <div className={styles.sheet} role="region" aria-label="Install">
      <p>Install Stay In Touch on this device.</p>
      <div className={styles.actions}>
        <Button
          onPress={() => {
            const prompt = currentInstallPrompt();
            if (!prompt) return;
            void prompt.prompt().then(() => {
              clearInstallPrompt();
              setInstalled(browserInstalled());
            });
          }}
        >
          Install
        </Button>
        <Button
          onPress={() => {
            localStorage.setItem(INSTALL_DISMISS_KEY, "1");
            setDismissed(true);
          }}
        >
          Not now
        </Button>
      </div>
    </div>
    );
}
