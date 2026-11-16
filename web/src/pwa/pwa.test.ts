import { describe, expect, it } from "vitest";
import { shouldOfferUpdate, shouldReloadOnControllerChange } from "./composeActivity.ts";
import {
  clearAllDrafts,
  draftStorageKey,
  readDraft,
  resumeDraftWrites,
  suspendDraftWrites,
  writeDraft,
} from "./drafts.ts";
import { installView, isInstalledDisplay, permissionView } from "./installState.ts";
import {
  applicationServerKeysMatch,
  applyWorkerBadge,
  notificationTarget,
  pushNotice,
} from "./notificationUrl.ts";
import { pausedUntilLabel, tomorrowSevenJerusalem } from "./pauseTime.ts";
import {
  DEVICE_PUSH_OFF_KEY,
  devicePushDisabled,
  disableThisDevice,
  shouldAutoRegisterPush,
  shouldSaveChangedSubscription,
} from "./pushClient.ts";

describe("install and permission", () => {
  it("shows the install card only for a held prompt", () => {
    expect(installView({ installed: false, dismissed: false, hasPrompt: true })).toBe("prompt");
    expect(installView({ installed: true, dismissed: false, hasPrompt: true })).toBe("hidden");
    expect(installView({ installed: false, dismissed: true, hasPrompt: true })).toBe("hidden");
    expect(installView({ installed: false, dismissed: false, hasPrompt: false })).toBe("hidden");
  });

  it("asks for permission only from a tap, and points iPhone to install help", () => {
    expect(
      permissionView({ ios: false, installed: false, permission: "default", snoozed: false }),
    ).toBe("ask");
    expect(
      permissionView({ ios: true, installed: false, permission: "default", snoozed: false }),
    ).toBe("ios-help");
    expect(
      permissionView({ ios: true, installed: true, permission: "default", snoozed: false }),
    ).toBe("ask");
    expect(
      permissionView({ ios: false, installed: false, permission: "denied", snoozed: false }),
    ).toBe("denied");
    expect(
      permissionView({ ios: false, installed: false, permission: "default", snoozed: true }),
    ).toBe("hidden");
    expect(
      permissionView({ ios: false, installed: false, permission: "granted", snoozed: false }),
    ).toBe("hidden");
  });

  it("treats standalone and navigator.standalone as installed", () => {
    expect(isInstalledDisplay(true, false)).toBe(true);
    expect(isInstalledDisplay(false, true)).toBe(true);
    expect(isInstalledDisplay(false, false)).toBe(false);
  });
});

describe("update prompt", () => {
  it("holds the prompt while someone is composing", () => {
    expect(shouldOfferUpdate({ needRefresh: true, composing: false, dismissed: false })).toBe(true);
    expect(shouldOfferUpdate({ needRefresh: true, composing: true, dismissed: false })).toBe(false);
    expect(shouldOfferUpdate({ needRefresh: true, composing: false, dismissed: true })).toBe(false);
    expect(shouldOfferUpdate({ needRefresh: false, composing: false, dismissed: false })).toBe(false);
  });

  it("keeps Later until a newer build, and reloads only the tab that asked", () => {
    expect(shouldOfferUpdate({ needRefresh: true, composing: false, dismissed: true })).toBe(false);
    expect(
      shouldOfferUpdate({
        needRefresh: true,
        composing: false,
        dismissed: true,
        newerVersion: true,
      }),
    ).toBe(true);
    expect(shouldReloadOnControllerChange(false)).toBe(false);
    expect(shouldReloadOnControllerChange(true)).toBe(true);
  });
});

describe("drafts", () => {
  it("stores text per person and space and clears every draft", () => {
    const mom = draftStorageKey("mom", "general");
    const noa = draftStorageKey("noa", "general");
    writeDraft(mom, "hello");
    writeDraft(noa, "hi");
    expect(readDraft(mom)).toBe("hello");
    clearAllDrafts();
    expect(readDraft(mom)).toBe("");
    expect(readDraft(noa)).toBe("");
    resumeDraftWrites();
  });

  it("does not write a draft back after sign-out suspends saves", () => {
    const mom = draftStorageKey("mom", "general");
    suspendDraftWrites();
    clearAllDrafts();
    writeDraft(mom, "mom was still typing");
    expect(readDraft(mom)).toBe("");
    resumeDraftWrites();
    writeDraft(mom, "noa");
    expect(readDraft(mom)).toBe("noa");
    clearAllDrafts();
    resumeDraftWrites();
  });
});

describe("push payload", () => {
  it("reads the badge, including zero, and ignores a bad payload", () => {
    const origin = "http://127.0.0.1:5173";
    const notice = pushNotice(
      {
        app_badge: 4,
        notification: {
          title: "Stay In Touch",
          body: "Grandma posted in Noa",
          tag: "space:noa",
          navigate: `${origin}/f/fam/s/noa/messages`,
        },
      },
      origin,
    );
    expect(notice.appBadge).toBe(4);
    expect(notice.body).toBe("Grandma posted in Noa");
    expect(pushNotice({ app_badge: 0 }, origin).appBadge).toBe(0);
    expect(pushNotice(null, origin).body).toBe("New activity in Stay In Touch");
    expect(pushNotice(null, origin).appBadge).toBeNull();
  });

  it("sets the worker badge and clears it at zero", async () => {
    const calls: string[] = [];
    const nav = {
      setAppBadge: (count: number) => {
        calls.push(`set:${count}`);
        return Promise.resolve();
      },
      clearAppBadge: () => {
        calls.push("clear");
        return Promise.resolve();
      },
    };
    await applyWorkerBadge(3, nav);
    await applyWorkerBadge(0, nav);
    await applyWorkerBadge(null, nav);
    expect(calls).toEqual(["set:3", "clear"]);
  });

  it("treats a different application server key as retired", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const configured = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(applicationServerKeysMatch(bytes.buffer, configured)).toBe(true);
    expect(applicationServerKeysMatch(new Uint8Array([9, 9, 9, 9]).buffer, configured)).toBe(
      false,
    );
    expect(applicationServerKeysMatch(null, configured)).toBe(false);
  });
});

describe("this device", () => {
  it("stays off until someone turns it on, and sign-out does not set that choice", async () => {
    localStorage.removeItem(DEVICE_PUSH_OFF_KEY);
    expect(
      shouldAutoRegisterPush({ deviceOff: false, permission: "granted", hasKey: true }),
    ).toBe(true);
    expect(
      shouldAutoRegisterPush({ deviceOff: true, permission: "granted", hasKey: true }),
    ).toBe(false);
    await disableThisDevice();
    expect(devicePushDisabled()).toBe(true);
    expect(shouldSaveChangedSubscription(devicePushDisabled())).toBe(false);
    localStorage.removeItem(DEVICE_PUSH_OFF_KEY);
    expect(devicePushDisabled()).toBe(false);
    expect(shouldSaveChangedSubscription(false)).toBe(true);
  });
});

describe("notification navigation", () => {
  it("keeps a same-origin thread and drops anything else", () => {
    const origin = "http://127.0.0.1:5173";
    expect(
      notificationTarget(
        { notification: { navigate: `${origin}/f/fam/s/space/messages` } },
        origin,
      ),
    ).toBe(`${origin}/f/fam/s/space/messages`);
    expect(
      notificationTarget({ notification: { navigate: "http://kong:8000/f/fam" } }, origin),
    ).toBeNull();
    expect(notificationTarget({ notification: {} }, origin)).toBeNull();
  });
});

describe("pause labels", () => {
  it("shows 07:00 in Asia/Jerusalem even when the runner is on UTC", () => {
    const iso = tomorrowSevenJerusalem(new Date("2026-11-16T22:30:00.000Z"));
    expect(pausedUntilLabel(iso)).toBe("Paused until 07:00");
  });
});
