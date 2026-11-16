// Prints a fresh P-256 VAPID pair and writes it to gitignored env files.
// VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are base64url-encoded JWK JSON.
// VITE_VAPID_PUBLIC_KEY is the raw key PushManager.subscribe expects.
import { exportApplicationServerKey, exportVapidKeys, generateVapidKeys } from "jsr:@negrel/webpush@0.5.0";

const root = new URL("../", import.meta.url);

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function encodeJwk(jwk: JsonWebKey): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(jwk)));
}

async function gitignored(path: string): Promise<void> {
  const check = new Deno.Command("git", {
    args: ["check-ignore", "-q", "--", path],
    cwd: Deno.cwd(),
  });
  const status = await check.output();
  if (status.code !== 0) {
    throw new Error(`${path} is not gitignored; refusing to write a key`);
  }
}

function upsert(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, line);
  const suffix = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  return `${text}${suffix}${line}\n`;
}

async function writeEnv(relativePath: string, values: Record<string, string>): Promise<void> {
  await gitignored(relativePath);
  const file = new URL(relativePath, root);
  let text = "";
  try {
    text = await Deno.readTextFile(file);
  } catch (caught) {
    if (!(caught instanceof Deno.errors.NotFound)) throw caught;
  }
  for (const [key, value] of Object.entries(values)) {
    text = upsert(text, key, value);
  }
  await Deno.writeTextFile(file, text);
}

const keys = await generateVapidKeys({ extractable: true });
const exported = await exportVapidKeys(keys);
const applicationServerKey = await exportApplicationServerKey(keys);
const publicJwk = encodeJwk(exported.publicKey);
const privateJwk = encodeJwk(exported.privateKey);

if (Deno.args.includes("--github-env")) {
  console.log(`::add-mask::${privateJwk}`);
  console.log(`VITE_VAPID_PUBLIC_KEY=${applicationServerKey}`);
  console.log(`VAPID_PUBLIC_KEY=${publicJwk}`);
  console.log(`VAPID_PRIVATE_KEY=${privateJwk}`);
  console.log("VAPID_SUBJECT=mailto:admin@example.test");
} else {
  await writeEnv(".env.local", {
    VITE_VAPID_PUBLIC_KEY: applicationServerKey,
    VAPID_PUBLIC_KEY: publicJwk,
    VAPID_PRIVATE_KEY: privateJwk,
    VAPID_SUBJECT: "mailto:admin@example.test",
  });
  await writeEnv("supabase/functions/.env", {
    VAPID_PUBLIC_KEY: publicJwk,
    VAPID_PRIVATE_KEY: privateJwk,
    VAPID_SUBJECT: "mailto:admin@example.test",
    PUSH_TRANSPORT: "webpush",
  });
  console.log("VAPID application server key (public):");
  console.log(applicationServerKey);
  console.log("Private key written to gitignored .env.local and supabase/functions/.env");
}
