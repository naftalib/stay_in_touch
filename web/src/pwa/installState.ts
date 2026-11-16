export type InstallView = "hidden" | "prompt";

export function installView(input: {
  installed: boolean;
  dismissed: boolean;
  hasPrompt: boolean;
}): InstallView {
  if (input.installed || input.dismissed || !input.hasPrompt) return "hidden";
  return "prompt";
}

export type PermissionView = "hidden" | "ask" | "denied" | "ios-help";

export function permissionView(input: {
  ios: boolean;
  installed: boolean;
  permission: NotificationPermission | "unsupported";
  snoozed: boolean;
}): PermissionView {
  if (input.ios && !input.installed) return "ios-help";
  if (input.permission === "granted" || input.permission === "unsupported") return "hidden";
  if (input.permission === "denied") return "denied";
  if (input.snoozed) return "hidden";
  return "ask";
}

export function isIosUserAgent(userAgent: string, platform: string, touchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return platform === "MacIntel" && touchPoints > 1;
}

export function isInstalledDisplay(matchesStandalone: boolean, navigatorStandalone: boolean): boolean {
  return matchesStandalone || navigatorStandalone;
}
