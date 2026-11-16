/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { notificationTarget, urlBase64ToBytes } from "./pwa/notificationUrl.ts";

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
  let title = "Stay In Touch";
  let body = "New activity in Stay In Touch";
  let tag = "stay-in-touch";
  let url = self.registration.scope;
  const raw = event.data?.text() ?? "";
  if (raw.length > 0) {
    try {
      const payload = JSON.parse(raw) as {
        notification?: { title?: string; body?: string; tag?: string; navigate?: string };
      };
      if (payload.notification?.title) title = payload.notification.title;
      if (payload.notification?.body) body = payload.notification.body;
      if (payload.notification?.tag) tag = payload.notification.tag;
      const target = notificationTarget(payload, self.location.origin);
      if (target) url = target;
    } catch {
      // A malformed payload still shows a notification. iOS drops a silent push.
    }
  }
  const options = {
    body,
    tag,
    renotify: true,
    lang: "en",
    dir: "ltr" as NotificationDirection,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
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
      const applicationServerKey =
        change.oldSubscription?.options.applicationServerKey ??
        (configured ? urlBase64ToBytes(configured) : null);
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
