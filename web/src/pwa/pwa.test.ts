import { describe, expect, it } from "vitest";
import { shouldOfferUpdate } from "./composeActivity.ts";
import { clearAllDrafts, draftStorageKey, readDraft, writeDraft } from "./drafts.ts";
import { installView, isInstalledDisplay, permissionView } from "./installState.ts";
import { notificationTarget } from "./notificationUrl.ts";
import { pausedUntilLabel, tomorrowSevenJerusalem } from "./pauseTime.ts";

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
