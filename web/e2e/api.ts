import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile() {
  try {
    const text = readFileSync(path.join(root, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, raw] = match;
      if (!process.env[key]) {
        process.env[key] = raw.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // CI exports these variables itself.
  }
}

loadEnvFile();

export const FAMILY_ID = "a0000000-0000-4000-8000-000000000001";
export const OTHER_FAMILY_ID = "b0000000-0000-4000-8000-000000000099";

export const SPACES = {
  general: "a3000000-0000-4000-8000-000000000001",
  mom: "a3000000-0000-4000-8000-000000000002",
  dad: "a3000000-0000-4000-8000-000000000003",
  noa: "a3000000-0000-4000-8000-000000000004",
  ari: "a3000000-0000-4000-8000-000000000005",
} as const;

export const MEMBERS = {
  noa: "a2000000-0000-4000-8000-000000000005",
  mom: "a2000000-0000-4000-8000-000000000001",
} as const;

export const MESSAGES = {
  welcome: "a4000000-0000-4000-8000-000000000001",
  deleted: "a4000000-0000-4000-8000-000000000003",
} as const;

const FORBIDDEN_BODIES = [
  "Notes from Mom.",
  "Dad's album.",
  "Hi from Ari.",
  "This one was deleted.",
];

function apiUrl(): string {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error("VITE_SUPABASE_URL is not set");
  return url;
}

function apiKey(): string {
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY is not set");
  return key;
}

export async function accessToken(email: string): Promise<string> {
  const res = await fetch(`${apiUrl()}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: "local-dev-only" }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function authed(email: string, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken(email);
  return fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      apikey: apiKey(),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function restGet(email: string, path: string): Promise<Response> {
  return authed(email, path, { method: "GET" });
}

export async function rpc(
  email: string,
  name: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return authed(email, `/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_stay-in-touch",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

export function assertNoForbiddenBodies(text: string) {
  for (const body of FORBIDDEN_BODIES) {
    if (text.includes(body)) {
      throw new Error(`Forbidden text leaked: ${body}`);
    }
  }
}

export { FORBIDDEN_BODIES };
