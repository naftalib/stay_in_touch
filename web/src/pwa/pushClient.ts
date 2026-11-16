import { getSupabase } from "../lib/supabase.ts";
import { applicationServerKeysMatch, urlBase64ToBytes } from "./notificationUrl.ts";

export const NOTIFY_SNOOZE_KEY = "sit-notify-snooze-until";
export const UPDATE_LATER_KEY = "sit-update-later";
export const PHOTOS_IN_PROGRESS_KEY = "sit-photos-in-progress";
export const DEVICE_PUSH_OFF_KEY = "sit-push-device-off";

export function vapidPublicKey(): string {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? "";
}

export function browserInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
  );
}

export function browserIsIos(): boolean {
  const nav = navigator as Navigator & {
    userAgent: string;
    platform: string;
    maxTouchPoints: number;
  };
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  return nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function notifySnoozed(now = Date.now()): boolean {
  const raw = localStorage.getItem(NOTIFY_SNOOZE_KEY);
  if (!raw) return false;
  const until = Date.parse(raw);
  return Number.isFinite(until) && until > now;
}

export function snoozeNotifications(days = 7): void {
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  localStorage.setItem(NOTIFY_SNOOZE_KEY, until.toISOString());
}

type JsonSubscription = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON() as JsonSubscription;
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
  const { error } = await getSupabase().rpc("register_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 400),
  });
  if (error) throw error;
}

// Playwright's WebKit never settles service-worker lookup when this device
// has no push subscription. Signing out and reading settings must not wait
// on that. A real registration finishes well inside this bound.
function settled<T>(promise: Promise<T>, ms = 8_000): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

function pushLookupAllowed(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  );
}

export function devicePushDisabled(): boolean {
  try {
    return localStorage.getItem(DEVICE_PUSH_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

export function shouldAutoRegisterPush(input: {
  deviceOff: boolean;
  permission: NotificationPermission | "unsupported";
  hasKey: boolean;
}): boolean {
  return input.hasKey && input.permission === "granted" && !input.deviceOff;
}

async function subscriptionForCurrentKey(
  registration: ServiceWorkerRegistration,
  key: string,
): Promise<PushSubscription | undefined> {
  let subscription = await settled(registration.pushManager.getSubscription());
  const current = subscription?.options.applicationServerKey ?? null;
  if (subscription && !applicationServerKeysMatch(current, key)) {
    await subscription.unsubscribe().catch(() => undefined);
    subscription = undefined;
  }
  if (!subscription) {
    subscription = await settled(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(key),
      }),
    );
  }
  return subscription;
}

export async function ensurePushRegistered(): Promise<void> {
  const key = vapidPublicKey();
  if (
    !shouldAutoRegisterPush({
      deviceOff: devicePushDisabled(),
      permission: notificationPermission(),
      hasKey: key.length > 0,
    })
  ) {
    return;
  }
  if (!pushLookupAllowed()) return;
  const registration = await settled(navigator.serviceWorker.ready);
  if (!registration) return;
  const subscription = await subscriptionForCurrentKey(registration, key);
  if (!subscription) return;
  await saveSubscription(subscription);
}

/** Called only from the Turn on button or the settings switch. */
export async function enablePushFromTap(): Promise<"granted" | "denied" | "unsupported"> {
  const key = vapidPublicKey();
  if (!key || !("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "unsupported";
  const registration = await settled(navigator.serviceWorker.ready);
  if (!registration) return "unsupported";
  const subscription = await subscriptionForCurrentKey(registration, key);
  if (!subscription) return "unsupported";
  await saveSubscription(subscription);
  return "granted";
}

export async function enableThisDevice(): Promise<"granted" | "denied" | "unsupported"> {
  try {
    localStorage.removeItem(DEVICE_PUSH_OFF_KEY);
  } catch {
    // The subscribe below is still the person's request to turn this device on.
  }
  return enablePushFromTap();
}

export async function disableThisDevice(): Promise<void> {
  try {
    localStorage.setItem(DEVICE_PUSH_OFF_KEY, "1");
  } catch {
    // Unsubscribe anyway so this browser stops receiving until the next choice.
  }
  await releasePushSubscription();
}

export async function currentDeviceSubscribed(): Promise<boolean> {
  if (devicePushDisabled()) return false;
  if (!pushLookupAllowed()) return false;
  const registration = await settled(navigator.serviceWorker.getRegistration());
  const subscription = registration
    ? await settled(registration.pushManager.getSubscription())
    : undefined;
  return Boolean(subscription);
}

export async function releasePushSubscription(): Promise<void> {
  if (!pushLookupAllowed()) return;
  const registration = await settled(navigator.serviceWorker.getRegistration());
  const subscription = registration
    ? await settled(registration.pushManager.getSubscription())
    : undefined;
  if (!subscription) return;
  try {
    await getSupabase().rpc("unregister_push_subscription", { p_endpoint: subscription.endpoint });
  } catch {
    // Still drop the browser subscription so this device stops receiving.
  }
  await subscription.unsubscribe().catch(() => undefined);
}

/** A browser-rotated subscription is saved only while this device is still on. */
export function shouldSaveChangedSubscription(deviceOff: boolean): boolean {
  return !deviceOff;
}

export async function registerChangedSubscription(input: {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
}): Promise<void> {
  if (!shouldSaveChangedSubscription(devicePushDisabled())) return;
  if (!input.endpoint || !input.p256dh || !input.auth) return;
  await getSupabase().rpc("register_push_subscription", {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_user_agent: navigator.userAgent.slice(0, 400),
  });
}
