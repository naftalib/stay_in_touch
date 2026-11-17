/** Check a deployed (or wrangler dev) site. Prints failures and exits 1. */

export type CheckResult = { ok: true } | { ok: false; errors: string[] };

function cache(headers: Headers): string {
  return headers.get("cache-control") ?? "";
}

function type(headers: Headers): string {
  return (headers.get("content-type") ?? "").toLowerCase();
}

function hasSecurity(headers: Headers): string[] {
  const errors: string[] = [];
  // Overlapping _headers rules can repeat the value, which fetch joins
  // with a comma. Either form still means nosniff.
  const nosniff = (headers.get("x-content-type-options") ?? "").toLowerCase();
  if (!nosniff.split(",").some((part) => part.trim() === "nosniff")) {
    errors.push("missing X-Content-Type-Options: nosniff");
  }
  const referrer = (headers.get("referrer-policy") ?? "").toLowerCase();
  if (!referrer.includes("strict-origin-when-cross-origin")) {
    errors.push("missing Referrer-Policy");
  }
  const permissions = (headers.get("permissions-policy") ?? "").toLowerCase();
  if (
    !permissions.includes("camera=()") ||
    !permissions.includes("microphone=()") ||
    !permissions.includes("geolocation=()")
  ) {
    errors.push(
      "Permissions-Policy must deny camera, microphone, and geolocation",
    );
  }
  if (/\bnotifications\s*=/.test(permissions)) {
    errors.push("Permissions-Policy must leave notifications alone");
  }
  return errors;
}

async function load(
  url: string,
): Promise<{ status: number; headers: Headers; body: string }> {
  const res = await fetch(url, { redirect: "follow" });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

export async function checkDeployedSite(base: string): Promise<CheckResult> {
  const root = base.replace(/\/$/, "");
  const errors: string[] = [];

  const home = await load(`${root}/`);
  if (home.status !== 200) errors.push(`/ status ${home.status}`);
  if (!type(home.headers).includes("text/html")) errors.push("/ is not HTML");
  if (!cache(home.headers).includes("no-cache")) {
    errors.push("/ is not no-cache");
  }
  errors.push(...hasSecurity(home.headers).map((item) => `/ ${item}`));

  const index = await load(`${root}/index.html`);
  if (index.status !== 200) errors.push(`/index.html status ${index.status}`);
  if (!cache(index.headers).includes("no-cache")) {
    errors.push("/index.html is not no-cache");
  }

  const worker = await load(`${root}/sw.js`);
  if (worker.status !== 200) errors.push(`/sw.js status ${worker.status}`);
  if (!type(worker.headers).includes("javascript")) {
    errors.push("/sw.js is not JavaScript");
  }
  if (
    /^\s*<!doctype html/i.test(worker.body) || /^\s*<html/i.test(worker.body)
  ) {
    errors.push("/sw.js returned HTML");
  }
  if (!cache(worker.headers).includes("no-cache")) {
    errors.push("/sw.js is not no-cache");
  }

  const manifest = await load(`${root}/manifest.webmanifest`);
  if (manifest.status !== 200) {
    errors.push(`/manifest.webmanifest status ${manifest.status}`);
  }
  if (!cache(manifest.headers).includes("no-cache")) {
    errors.push("/manifest.webmanifest is not no-cache");
  }

  const deep = await load(`${root}/f/x/s/y/messages`);
  if (deep.status !== 200) {
    errors.push(`/f/x/s/y/messages status ${deep.status}`);
  }
  if (!type(deep.headers).includes("text/html")) {
    errors.push("deep link is not HTML");
  }
  if (
    /^\s*<!doctype html/i.test(deep.body) === false &&
    !deep.body.includes("<html")
  ) {
    errors.push("deep link body is not the app HTML");
  }

  const asset = index.body.match(/\/assets\/[^"' ]+\.js/);
  if (!asset) {
    errors.push("index.html has no hashed /assets script");
  } else {
    const file = await load(`${root}${asset[0]}`);
    if (file.status !== 200) errors.push(`${asset[0]} status ${file.status}`);
    const control = cache(file.headers);
    if (!control.includes("immutable") || !control.includes("31536000")) {
      errors.push(`${asset[0]} is not a long-lived immutable asset`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

async function main(): Promise<void> {
  const base = Deno.args[0] ?? Deno.env.get("POST_DEPLOY_URL");
  if (!base) {
    console.error("usage: post-deploy-check <url>");
    Deno.exit(1);
  }
  const result = await checkDeployedSite(base);
  if (!result.ok) {
    for (const error of result.errors) console.error(error);
    Deno.exit(1);
  }
  console.log("post-deploy check passed");
}

if (import.meta.main) {
  await main();
}
