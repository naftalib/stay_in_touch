import { useState } from "react";
import { Button } from "react-aria-components";
import { Link } from "react-router";
import { permissionView } from "./installState.ts";
import {
  browserInstalled,
  browserIsIos,
  enablePushFromTap,
  notificationPermission,
  notifySnoozed,
  snoozeNotifications,
} from "./pushClient.ts";
import styles from "./PwaChrome.module.css";

export default function PermissionCard() {
  const [permission, setPermission] = useState(notificationPermission);
  const [snoozed, setSnoozed] = useState(() => notifySnoozed());
  const view = permissionView({
    ios: browserIsIos(),
    installed: browserInstalled(),
    permission,
    snoozed,
  });

  if (view === "hidden") return null;

  if (view === "ios-help") {
    return (
      <div className={styles.sheet} role="region" aria-label="Notifications">
        <p>Notifications on iPhone and iPad work after you add Stay In Touch to the Home Screen.</p>
        <Link className={styles.linkButton} to="/install">
          How to install
        </Link>
      </div>
    );
  }

  if (view === "denied") {
    return (
      <div className={styles.sheet} role="region" aria-label="Notifications">
        <p>
          Notifications are turned off for Stay In Touch in this browser. You can turn them back on
          in the browser's site settings.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.sheet} role="region" aria-label="Notifications">
      <p>Get notified when family posts.</p>
      <div className={styles.actions}>
        <Button
          onPress={() => {
            void enablePushFromTap().then((result) => {
              if (result === "denied") setPermission("denied");
              else setPermission(notificationPermission());
            });
          }}
        >
          Turn on
        </Button>
        <Button
          onPress={() => {
            snoozeNotifications(7);
            setSnoozed(true);
          }}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
