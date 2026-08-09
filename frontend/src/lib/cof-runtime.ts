import { readFileSync } from "fs";
import { join } from "path";

// Runtime config resolver for server-side API routes.
// The app runs natively via `next start` (cwd = frontend/), not Docker, and the
// launcher injects no env. The canonical LOCAL_AUTH_TOKEN lives in the repo-root
// .env (one level up). Resolve it from there when process.env is empty.

let cachedToken: string | null | undefined;

function readTokenFromEnvFile(): string | null {
  const candidates = [join(process.cwd(), "..", ".env"), join(process.cwd(), ".env")];
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, "utf8");
      const match = raw.match(/^\s*LOCAL_AUTH_TOKEN\s*=\s*(.+?)\s*$/m);
      if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      // file absent or unreadable — try next candidate
    }
  }
  return null;
}

export function getLocalAuthToken(): string | null {
  if (cachedToken !== undefined) return cachedToken;
  const fromEnv = process.env.LOCAL_AUTH_TOKEN?.trim();
  cachedToken = fromEnv && fromEnv.length > 0 ? fromEnv : readTokenFromEnvFile();
  return cachedToken;
}

export function getOpenClawApiBase(): string {
  return process.env.OPENCLAW_BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";
}

export function getCofHost(): string {
  return process.env.COF_HOST ?? "http://127.0.0.1";
}
