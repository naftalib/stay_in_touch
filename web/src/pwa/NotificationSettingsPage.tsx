import { useCallback, useEffect, useState } from "react";
import { Button, Switch } from "react-aria-components";
import { Link } from "react-router";
import { useFamily } from "../family/FamilyProvider.tsx";
import { getSupabase } from "../lib/supabase.ts";
import { INSTALL_DISMISS_KEY, reopenInstallCard } from "./installPrompt.ts";
import { eightHoursFrom, pausedUntilLabel, tomorrowSevenJerusalem } from "./pauseTime.ts";
import { currentDeviceSubscribed, disableThisDevice, enableThisDevice } from "./pushClient.ts";
import styles from "./NotificationSettingsPage.module.css";

type SettingRow = {
  member_id: string;
  space_id: string | null;
  space_title: string | null;
  push: boolean;
  muted_until: string | null;
};

export default function NotificationSettingsPage() {
  const { membership } = useFamily();
  const familyId = membership.family_id;
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [deviceOn, setDeviceOn] = useState(false);
  const [status, setStatus] = useState("");
  const [installDismissed, setInstallDismissed] = useState(
    () => localStorage.getItem(INSTALL_DISMISS_KEY) === "1",
  );

  const load = useCallback(async () => {
    const { data, error } = await getSupabase().rpc("my_notification_settings", {
      p_family_id: familyId,
    });
    if (error) {
      setStatus("Couldn't load notification settings.");
      return;
    }
    setRows((data ?? []) as SettingRow[]);
    setDeviceOn(await currentDeviceSubscribed());
  }, [familyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(message: string, action: () => PromiseLike<unknown>) {
    setStatus("");
    const { error } = (await action()) as { error: { message: string } | null };
    if (error) {
      setStatus("Couldn't save that change.");
      return;
    }
    setStatus(message);
    await load();
  }

  const defaults = rows.find((row) => row.space_id === null);
  const spaces = rows.filter((row) => row.space_id);
  const [openedAt] = useState(() => Date.now());
  const paused =
    defaults?.muted_until && Date.parse(defaults.muted_until) > openedAt
      ? defaults.muted_until
      : null;

  return (
    <section className={styles.page}>
      <h1>Notifications</h1>
      <p id="settings-status" role="status" aria-live="polite">
        {status}
      </p>
      <Switch
        isSelected={deviceOn}
        onChange={(on) => {
          void (async () => {
            if (on) {
              const result = await enableThisDevice();
              setDeviceOn(result === "granted");
              setStatus(result === "granted" ? "Saved" : "Notifications stay off on this device.");
            } else {
              await disableThisDevice();
              setDeviceOn(false);
              setStatus("Saved");
            }
          })();
        }}
      >
        <span className={styles.track} aria-hidden="true" />
        This device
      </Switch>
      <Switch
        isSelected={defaults?.push !== false}
        onChange={(on) => {
          void save("Saved", () =>
            getSupabase().rpc("set_notifications_enabled", {
              p_family_id: familyId,
              p_enabled: on,
            }),
          );
        }}
      >
        <span className={styles.track} aria-hidden="true" />
        All notifications
      </Switch>
      <div className={styles.actions}>
        <Button
          onPress={() => {
            void save("Saved", () =>
              getSupabase().rpc("set_notifications_paused", {
                p_family_id: familyId,
                p_until: eightHoursFrom(),
              }),
            );
          }}
        >
          Pause 8 hours
        </Button>
        <Button
          onPress={() => {
            void save("Saved", () =>
              getSupabase().rpc("set_notifications_paused", {
                p_family_id: familyId,
                p_until: tomorrowSevenJerusalem(),
              }),
            );
          }}
        >
          Pause until tomorrow 07:00
        </Button>
        {paused ? (
          <Button
            onPress={() => {
              void save("Saved", () =>
                getSupabase().rpc("set_notifications_paused", {
                  p_family_id: familyId,
                  // Generated types omit null. Null clears the pause.
                  p_until: null as unknown as string,
                }),
              );
            }}
          >
            Resume
          </Button>
        ) : null}
      </div>
      {paused ? <p>{pausedUntilLabel(paused)}</p> : null}
      <h2>Spaces</h2>
      <ul className={styles.spaces}>
        {spaces.map((space) => (
          <li key={space.space_id}>
            <Switch
              isSelected={space.push}
              onChange={(on) => {
                if (!space.space_id) return;
                void save("Saved", () =>
                  getSupabase().rpc("set_space_muted", {
                    p_space_id: space.space_id as string,
                    p_muted: !on,
                  }),
                );
              }}
            >
              <span className={styles.track} aria-hidden="true" />
              {space.space_title}
            </Switch>
          </li>
        ))}
      </ul>
      {installDismissed ? (
        <Button
          onPress={() => {
            reopenInstallCard();
            setInstallDismissed(false);
            setStatus("You can install Stay In Touch from the next prompt.");
          }}
        >
          Install Stay In Touch
        </Button>
      ) : null}
      <p>
        <Link to="/install">How to add this app to the Home Screen</Link>
      </p>
    </section>
  );
}
