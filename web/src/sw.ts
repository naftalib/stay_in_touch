/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import {
  applyWorkerBadge,
  NOTIFICATION_BADGE,
  NOTIFICATION_ICON,
  pushNotice,
  urlBase64ToBytes,
} from "./pwa/notificationUrl.ts";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const navigation = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(navigation, {
    denylist: [/^\/auth\//, /^\/functions\//, /^\/rest\//, /^\/storage\//],
  }),
);

self.addEventListener("message", (event) => {
  const data = event.data as { type?: string; url?: string } | null;
  if (data?.type === "SKIP_WAITING") self.skipWaiting();
  if (data?.type === "NOTIFICATION_CLICK" && typeof data.url === "string") {
    event.waitUntil(openOrFocus(data.url));
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const raw = event.data?.text() ?? "";
  let parsed: unknown = null;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A malformed payload still shows a notification. iOS drops a silent push.
      parsed = null;
    }
  }
  const notice = pushNotice(parsed, self.location.origin);
  const nav = self.navigator as {
    setAppBadge?: (count: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  const options = {
    body: notice.body,
    tag: notice.tag,
    renotify: true,
    lang: "en",
    dir: "ltr" as NotificationDirection,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    data: { url: notice.url ?? self.registration.scope },
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(notice.title, options);
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        client.postMessage({
          type: "PUSH_SHOWN",
          title: notice.title,
          body: notice.body,
          tag: notice.tag,
        });
      }
      await applyWorkerBadge(notice.appBadge, nav);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | undefined;
  event.waitUntil(openOrFocus(data?.url ?? self.registration.scope));
});

self.addEventListener("pushsubscriptionchange", (event) => {
  const change = event as ExtendableEvent & {
    oldSubscription?: PushSubscription | null;
  };
  change.waitUntil(
    (async () => {
      const configured = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? "";
      const applicationServerKey = configured
        ? urlBase64ToBytes(configured)
        : (change.oldSubscription?.options.applicationServerKey ?? null);
      if (!applicationServerKey) return;
      const next = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const json = next.toJSON();
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        client.postMessage({
          type: "PUSH_SUBSCRIPTION_CHANGED",
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        });
      }
    })(),
  );
});

async function openOrFocus(raw: string): Promise<void> {
  let target: URL;
  try {
    target = new URL(raw, self.location.origin);
  } catch {
    return;
  }
  if (target.origin !== self.location.origin) return;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    const windowClient = client as WindowClient;
    // postMessage covers browsers where WindowClient.navigate is missing
    // and headless Chrome where navigate() resolves without moving the page.
    windowClient.postMessage({ type: "NAVIGATE", url: target.href });
    try {
      await windowClient.focus();
    } catch {
      // A hidden or headless client can reject focus. The page still navigates.
    }
    if (typeof windowClient.navigate === "function") {
      try {
        await windowClient.navigate(target.href);
      } catch {
        // The NAVIGATE message is the fallback.
      }
    }
    return;
  }
  await self.clients.openWindow(target.href);
}
