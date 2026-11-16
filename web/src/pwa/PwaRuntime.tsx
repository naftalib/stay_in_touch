import { useEffect } from "react";
import { useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext.tsx";
import InstallCard from "./InstallCard.tsx";
import PermissionCard from "./PermissionCard.tsx";
import { ensurePushRegistered, registerChangedSubscription } from "./pushClient.ts";
import styles from "./PwaChrome.module.css";
import UpdatePrompt from "./UpdatePrompt.tsx";

export default function PwaRuntime() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const inShell = pathname.startsWith("/f/");

  useEffect(() => {
    if (status !== "signedIn") return;
    void ensurePushRegistered().catch(() => undefined);
  }, [status]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        url?: string;
        endpoint?: string;
        p256dh?: string;
        auth?: string;
      } | null;
      if (data?.type === "PUSH_SUBSCRIPTION_CHANGED") {
        void registerChangedSubscription(data).catch(() => undefined);
      }
      if (data?.type === "NAVIGATE" && data.url) {
        const url = new URL(data.url, window.location.origin);
        if (url.origin === window.location.origin) window.location.assign(url.href);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  if (!inShell) return null;

  return (
    <div className={styles.stack}>
      <UpdatePrompt />
      <InstallCard />
      {status === "signedIn" ? <PermissionCard /> : null}
    </div>
  );
}

