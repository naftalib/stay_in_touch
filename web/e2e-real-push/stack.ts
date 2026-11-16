import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MEMBERS, psql } from "../e2e/api.ts";

const require = createRequire(import.meta.url);
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test-results");

const markerPattern = /^smoke-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*-not-in-push$/;

export function makeMarker(runId: string, retry: number): string {
  const safeRun = runId.replace(/[^0-9A-Za-z]/g, "") || "local";
  const marker = `smoke-${safeRun}-${retry}-not-in-push`;
  if (!markerPattern.test(marker)) throw new Error("refusing to build a marker");
  return marker;
}

export function redact(text: string, marker: string): string {
  const hidden = marker ? text.split(marker).join("[redacted]") : text;
  const urls = hidden.replace(/https:\/\/fcm\.googleapis\.com\/\S+/g, (url) => {
    return `https://fcm.googleapis.com/…${url.replace(/[),.;]+$/g, "").slice(-6)}`;
  });
  const tokens = urls.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]");
  return tokens
    .split("\n")
    .filter((line) => !/p256dh|VAPID_PRIVATE|private_key|BEGIN /i.test(line))
    .join("\n");
}

export function endpointRef(endpoint: string): string {
  const host = new URL(endpoint).host;
  return `host=${host} suffix=${endpoint.slice(-6)}`;
}

export function fcmLabel(lastStatus: string): string {
  if (lastStatus === "201" || lastStatus === "200" || lastStatus === "202") return "2xx (library)";
  if (!lastStatus) return "missing";
  return lastStatus;
}

function sqlMarker(marker: string): string {
  if (!markerPattern.test(marker)) throw new Error("refusing to query with an unexpected marker");
  return marker;
}

export function ensurePushPath(): { host: string; httpPost: boolean } {
  const httpReady = psql("select (to_regproc('net.http_post') is not null)::text") === "true";
  if (!httpReady) {
    psql("create extension if not exists pg_net");
  }
  const vaultReady =
    psql(
      "select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'vault' and p.proname = 'create_secret')::text",
    ) === "true";
  if (!vaultReady) {
    psql("create extension if not exists supabase_vault");
  }
  const httpPost = psql("select (to_regproc('net.http_post') is not null)::text") === "true";
  const url = process.env.PUSH_SMOKE_PUSH_URL ?? "http://kong:8000/functions/v1/push-send";
  if (url.includes("'")) throw new Error("PUSH_SMOKE_PUSH_URL has a quote");
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith("/functions/v1/push-send")) {
    throw new Error("PUSH_SMOKE_PUSH_URL must end with /functions/v1/push-send");
  }
  if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
    throw new Error(`${parsed.host} is the database container itself; use the Kong alias`);
  }
  const secret = process.env.PUSH_SEND_SECRET ?? "local-push-dev";
  if (!/^[A-Za-z0-9-]+$/.test(secret)) throw new Error("push send secret has unexpected characters");
  psql(`
    do $$
    begin
      if not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'vault' and p.proname = 'create_secret'
      ) then
        raise exception 'vault.create_secret is missing';
      end if;
      if not exists (select 1 from vault.decrypted_secrets where name = 'push_send_secret') then
        perform vault.create_secret('${secret}', 'push_send_secret', 'push smoke');
      end if;
      if not exists (select 1 from vault.decrypted_secrets where name = 'push_send_url') then
        perform vault.create_secret('${url}', 'push_send_url', 'push smoke');
      end if;
    end
    $$;
  `);
  const host = psql(
    "select coalesce(split_part(decrypted_secret, '/', 3), '') from vault.decrypted_secrets where name = 'push_send_url' limit 1",
  );
  return { host, httpPost };
}

export function noaEndpoints(): string[] {
  const raw = psql(`
    select coalesce(string_agg(ps.endpoint, ','), '')
    from public.push_subscriptions ps
    join auth.users u on u.id = ps.user_id
    where u.email = 'mom+noa@example.test'
  `);
  if (!raw) return [];
  return raw.split(",").filter((item) => item.length > 0);
}

export function outboxSummary(marker: string): string {
  const body = sqlMarker(marker);
  return psql(`
    select coalesce(string_agg(
      fm.label || '=' || o.status || '/' || coalesce(o.last_status::text, '') || '/' ||
      coalesce(o.skip_reason, '') || '/attempts=' || o.attempts::text,
      '; ' order by fm.label
    ), '')
    from public.notification_outbox o
    join public.messages m on m.id = o.ref_id
    join public.family_members fm on fm.id = o.recipient_member_id
    where m.body = '${body}'
  `);
}

export function noaOutbox(marker: string): string {
  const body = sqlMarker(marker);
  return psql(`
    select coalesce(string_agg(
      o.status || '|' || coalesce(o.last_status::text, '') || '|' ||
      coalesce(o.skip_reason, '') || '|' || o.attempts::text,
      ','
    ), '')
    from public.notification_outbox o
    join public.messages m on m.id = o.ref_id
    where m.body = '${body}'
      and o.recipient_member_id = '${MEMBERS.noa}'
  `);
}

export function sentPayload(marker: string): string {
  const body = sqlMarker(marker);
  return psql(`
    select coalesce(string_agg(coalesce(o.sent_payload::text, ''), '\n'), '')
    from public.notification_outbox o
    join public.messages m on m.id = o.ref_id
    where m.body = '${body}'
      and o.recipient_member_id = '${MEMBERS.noa}'
  `);
}

export function deliveryCount(marker: string): string {
  const body = sqlMarker(marker);
  return psql(`
    select count(*)::text
    from public.push_deliveries d
    join public.notification_outbox o on o.id = d.outbox_id
    join public.messages m on m.id = o.ref_id
    where m.body = '${body}'
      and o.recipient_member_id = '${MEMBERS.noa}'
  `);
}

export function netResponses(): string {
  return psql(`
    select case
      when to_regclass('net._http_response') is null then 'net._http_response missing'
      else coalesce((
        select string_agg(
          status_code::text || ' ' || left(coalesce(content, ''), 160),
          ' | ' order by id desc
        )
        from (select id, status_code, content from net._http_response order by id desc limit 5) recent
      ), 'no responses')
    end
  `);
}

export function messageCount(marker: string): string {
  const body = sqlMarker(marker);
  return psql(`select count(*)::text from public.messages where body = '${body}'`);
}

export function edgeRuntimeLog(): string {
  const listed = spawnSync("docker", ["ps", "-a", "--format", "{{.Names}}"], { encoding: "utf8" });
  const name = `${listed.stdout ?? ""}`
    .split("\n")
    .find((line) => line.includes("edge_runtime"));
  if (!name) return "edge runtime container not found";
  const logs = spawnSync("docker", ["logs", "--tail", "400", name], { encoding: "utf8" });
  return `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`.trim();
}

export function chromeCliVersion(): string {
  for (const bin of ["google-chrome", "google-chrome-stable", "chrome"]) {
    const result = spawnSync(bin, ["--version"], { encoding: "utf8" });
    const version = (result.stdout ?? "").trim();
    if (result.status === 0 && version) return version;
  }
  return "unknown";
}

export function playwrightVersion(): string {
  const pkg = require("@playwright/test/package.json") as { version: string };
  return pkg.version;
}

export function writeReport(text: string): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "push-smoke-diagnostics.txt"), text);
}

export function dropSubscription(endpoint: string): void {
  if (!endpoint.startsWith("https://") || endpoint.includes("'")) return;
  try {
    psql(`delete from public.push_subscriptions where endpoint = '${endpoint}'`);
  } catch {
    // The runner throws the database away. Unsubscribe in the browser is the cleanup that matters.
  }
}
