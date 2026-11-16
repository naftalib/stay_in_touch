import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { SEED_USERS, ensureSpacesNavOpen, signInWithPassword, spacesNav } from "../e2e/fixtures.ts";
import { SPACES } from "../e2e/api.ts";
import {
  chromeCliVersion,
  deliveryCount,
  dropSubscription,
  edgeRuntimeLog,
  endpointRef,
  ensurePushPath,
  fcmLabel,
  makeMarker,
  messageCount,
  netResponses,
  noaEndpoints,
  noaOutbox,
  outboxSummary,
  playwrightVersion,
  redact,
  sentPayload,
  writeReport,
} from "./stack.ts";

const bodyPattern = /^(Grandma posted in Noa|\d+ new posts in Noa)/;
const origin = "http://127.0.0.1:5173";
const spaceTag = `space:${SPACES.noa}`;

type PushSlot = { title: string; body: string; tag: string };
type Note = { title: string; body: string; tag: string };

function assertClean(label: string, text: string, marker: string): void {
  if (text.includes(marker)) throw new Error(`marker leaked in ${label}`);
}

async function waitForController(page: Page): Promise<void> {
  const controlled = () => page.evaluate(() => navigator.serviceWorker.controller !== null);
  try {
    await expect.poll(controlled, { timeout: 15_000 }).toBe(true);
  } catch {
    await page.reload();
    await expect.poll(controlled, { timeout: 15_000 }).toBe(true);
  }
}

async function readLastPush(page: Page): Promise<PushSlot | null> {
  const worker = page.context().serviceWorkers()[0];
  if (!worker) return null;
  return worker.evaluate(() => {
    const slot = (globalThis as { __lastPush?: PushSlot }).__lastPush;
    if (!slot) return null;
    return { title: slot.title, body: slot.body, tag: slot.tag };
  });
}

async function shownNotifications(page: Page): Promise<Note[] | "unavailable"> {
  try {
    return await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const list = await registration.getNotifications();
      return list.map((note) => ({
        title: note.title,
        body: note.body,
        tag: note.tag,
      }));
    });
  } catch {
    return "unavailable";
  }
}

test("headed Chrome receives a decrypted who-and-where push", async ({ browserName }, testInfo) => {
  void browserName;
  if (testInfo.retry > 0) {
    console.log(`push-smoke retry=${testInfo.retry} previous attempt failed`);
  }
  if (process.platform === "linux" && !process.env.DISPLAY) {
    throw new Error("Headed Chrome needs a display. On Linux run: xvfb-run -a pnpm test:push:real");
  }

  const marker = makeMarker(process.env.GITHUB_RUN_ID ?? `${Date.now()}`, testInfo.retry);
  const keepBackgroundBlock = process.env.PUSH_SMOKE_KEEP_BACKGROUND_NETWORKING === "1";
  const consoleLines: string[] = [];
  let failed = false;
  let failureText = "";
  let profile = "";
  let endpoint = "";
  let context: BrowserContext | undefined;
  let grandmaContext: BrowserContext | undefined;
  let extraBrowser: Browser | undefined;
  let page: Page | undefined;

  try {
    const vault = ensurePushPath();
    if (!vault.httpPost) {
      throw new Error("net.http_post is missing, so the trigger cannot reach push-send");
    }
    console.log(
      `push-smoke background_networking=${keepBackgroundBlock ? "playwright-default-disabled" : "enabled"} vault_host=${vault.host} pg_net=yes trigger=pg_net`,
    );

    profile = await mkdtemp(path.join(os.tmpdir(), "sit-push-"));
    context = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless: false,
      ...(keepBackgroundBlock ? {} : { ignoreDefaultArgs: ["--disable-background-networking"] }),
      viewport: { width: 1280, height: 800 },
      baseURL: origin,
      args: ["--no-first-run", "--no-default-browser-check", "--disable-sync"],
    });
    const browserVersion = context.browser()?.version() ?? "unknown";
    console.log(
      `push-smoke chrome=${browserVersion} cli=${chromeCliVersion()} playwright=${playwrightVersion()}`,
    );
    context.on("console", (msg) => {
      consoleLines.push(`${msg.type()}: ${msg.text()}`);
    });
    context.on("serviceworker", (worker) => {
      worker.on("console", (msg) => {
        consoleLines.push(`sw ${msg.type()}: ${msg.text()}`);
      });
    });

    page = context.pages()[0] ?? (await context.newPage());
    await signInWithPassword(page, SEED_USERS.noa);
    await waitForController(page);
    const turnOn = page.getByRole("region", { name: "Notifications" }).getByRole("button", { name: "Turn on" });
    await expect(turnOn).toBeVisible();
    const installLater = page.getByRole("region", { name: "Install" }).getByRole("button", { name: "Not now" });
    if (await installLater.isVisible()) await installLater.click();
    await context.grantPermissions(["notifications"], { origin });
    await expect(turnOn).toBeVisible();

    const subscribeStarted = Date.now();
    await turnOn.click();
    await expect
      .poll(
        async () => {
          const raw = await page!.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            const subscription = await registration?.pushManager.getSubscription();
            return subscription?.endpoint ?? "";
          });
          endpoint = raw;
          if (!raw) return "missing";
          if (raw.startsWith("https://fcm.googleapis.com/")) return "fcm";
          try {
            return `other-host:${new URL(raw).host}`;
          } catch {
            return "unparseable";
          }
        },
        { timeout: 90_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toBe("fcm");
    const browserMs = Date.now() - subscribeStarted;

    const stored = () => noaEndpoints().includes(endpoint);
    let savedVia = "";
    try {
      await expect.poll(stored, { timeout: 15_000 }).toBe(true);
      savedVia = "turn-on";
    } catch {
      await page.reload();
      await waitForController(page);
      try {
        await expect.poll(stored, { timeout: 20_000 }).toBe(true);
        savedVia = "reload";
      } catch {
        const stillThere = await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription = await registration?.pushManager.getSubscription();
          const value = subscription?.endpoint ?? "";
          if (!value) return "missing";
          if (value.startsWith("https://fcm.googleapis.com/")) return "fcm";
          return "other-host";
        });
        throw new Error(`subscription was not stored after Turn on (browser ${stillThere})`);
      }
    }
    console.log(
      `push-smoke subscribe_ms=${Date.now() - subscribeStarted} browser_ms=${browserMs} saved=${savedVia} ${endpointRef(endpoint)}`,
    );

    const owner = context.browser();
    const grandmaOptions = { viewport: { width: 1280, height: 800 }, baseURL: origin };
    if (owner) {
      try {
        grandmaContext = await owner.newContext(grandmaOptions);
      } catch {
        extraBrowser = await chromium.launch({ channel: "chrome", headless: false });
        grandmaContext = await extraBrowser.newContext(grandmaOptions);
      }
    } else {
      extraBrowser = await chromium.launch({ channel: "chrome", headless: false });
      grandmaContext = await extraBrowser.newContext(grandmaOptions);
    }
    const grandmaPage = await grandmaContext.newPage();
    await signInWithPassword(grandmaPage, SEED_USERS.grandma);
    await ensureSpacesNavOpen(grandmaPage);
    await spacesNav(grandmaPage).getByRole("link", { name: /Noa/ }).click();
    await expect(grandmaPage).toHaveURL(new RegExp(`/s/${SPACES.noa}/messages`));
    const composer = grandmaPage.getByRole("main").getByRole("textbox", { name: "Message" });
    await composer.fill(marker);
    const postedAt = Date.now();
    await grandmaPage.getByRole("main").getByRole("button", { name: "Send" }).click();
    await expect(composer).toHaveValue("");
    await expect.poll(() => messageCount(marker), { timeout: 20_000 }).toBe("1");

    let noteMode = "unknown";
    await expect
      .poll(
        async () => {
          const code = await deliveryCode(page!);
          if (code.startsWith("ok")) noteMode = code === "ok" ? "match" : code.slice(3);
          return code;
        },
        { timeout: 120_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toMatch(/^ok/);
    const row = noaOutbox(marker);
    const lastStatus = row.split("|")[1] ?? "";
    console.log(
      `push-smoke delivery_ms=${Date.now() - postedAt} fcm=${fcmLabel(lastStatus)} vault_host=${vault.host} trigger=pg_net notifications=${noteMode}`,
    );

    const push = await readLastPush(page);
    assertClean("service worker", JSON.stringify(push), marker);
    const notes = await shownNotifications(page);
    assertClean("notification", JSON.stringify(notes), marker);
    assertClean("sent payload", sentPayload(marker), marker);
    assertClean("outbox", outboxSummary(marker), marker);
    assertClean("edge log", edgeRuntimeLog(), marker);
    assertClean("console", consoleLines.join("\n"), marker);
  } catch (caught) {
    failed = true;
    const raw = caught instanceof Error ? (caught.stack ?? caught.message) : "failed";
    failureText = redact(raw, marker);
    throw new Error(failureText);
  } finally {
    if (failed) {
      const report = redact(
        [failureText, diagnostics(marker, consoleLines), `endpoint ${endpoint ? endpointRef(endpoint) : "missing"}`].join(
          "\n\n",
        ),
        marker,
      );
      console.log(report);
      writeReport(report);
      await testInfo
        .attach("push-smoke-diagnostics", { body: Buffer.from(report), contentType: "text/plain" })
        .catch(() => undefined);
    }
    if (page) {
      await page
        .evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription = await registration?.pushManager.getSubscription();
          if (subscription) await subscription.unsubscribe();
        })
        .catch(() => undefined);
    }
    if (endpoint) dropSubscription(endpoint);
    await grandmaContext?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await extraBrowser?.close().catch(() => undefined);
    if (profile) await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }

  async function deliveryCode(active: Page): Promise<string> {
    const push = await readLastPush(active);
    const pushState = classifyPush(push);
    let outbox = "missing";
    let deliveries = "0";
    try {
      const row = noaOutbox(marker);
      outbox = row.split("|")[0] || "missing";
      deliveries = deliveryCount(marker) || "0";
    } catch {
      return "waiting db";
    }
    const notes = await shownNotifications(active);
    const noteState = classifyNotes(notes);
    if (pushState === "marker" || noteState === "marker") return "marker-leaked";
    const delivered = outbox === "sent" && Number(deliveries) >= 1 && pushState === "ok";
    if (delivered && (noteState === "ok" || noteState === "empty" || noteState === "unavailable")) {
      if (noteState === "ok") return "ok";
      return `ok-${noteState}`;
    }
    return `waiting push=${pushState} outbox=${outbox} deliveries=${deliveries} notes=${noteState}`;
  }

  function classifyPush(push: PushSlot | null): string {
    if (!push) return "waiting";
    if ([push.title, push.body, push.tag].some((part) => part.includes(marker))) return "marker";
    if (push.title !== "Stay In Touch") return "bad-title";
    if (push.tag !== spaceTag) return "bad-tag";
    if (!bodyPattern.test(push.body)) return "bad-body";
    return "ok";
  }

  function classifyNotes(notes: Note[] | "unavailable"): string {
    if (notes === "unavailable") return "unavailable";
    if (notes.length === 0) return "empty";
    if (notes.some((note) => [note.title, note.body, note.tag].some((part) => part.includes(marker)))) {
      return "marker";
    }
    const match = notes.some(
      (note) => note.title === "Stay In Touch" && note.tag === spaceTag && bodyPattern.test(note.body),
    );
    return match ? "ok" : "bad";
  }
});

function diagnostics(marker: string, consoleLines: string[]): string {
  const chunks: string[] = [];
  const reads: [string, () => string][] = [
    ["outbox", () => outboxSummary(marker)],
    ["noa_outbox", () => noaOutbox(marker)],
    ["deliveries", () => deliveryCount(marker)],
    ["pg_net", () => netResponses()],
    ["edge", () => edgeRuntimeLog()],
    ["chrome_cli", () => chromeCliVersion()],
  ];
  for (const [label, read] of reads) {
    try {
      chunks.push(`${label}: ${read()}`);
    } catch {
      chunks.push(`${label}: query failed`);
    }
  }
  try {
    const payload = sentPayload(marker);
    chunks.push(payload.includes(marker) ? "sent_payload: marker leaked" : `sent_payload: ${payload}`);
  } catch {
    chunks.push("sent_payload: query failed");
  }
  try {
    chunks.push(`stored_endpoints: ${noaEndpoints().length}`);
  } catch {
    chunks.push("stored_endpoints: query failed");
  }
  chunks.push(`console:\n${consoleLines.slice(-80).join("\n")}`);
  return chunks.join("\n");
}
