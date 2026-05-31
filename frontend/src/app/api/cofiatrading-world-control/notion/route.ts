import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE = process.env.COF_OPENCLAW_STATE ?? "/Users/burakokyay/.openclaw/state";
const CREDS_PATH =
  process.env.COF_CREDENTIALS_ENV ?? "/Users/burakokyay/cof-trading/config/credentials.env";

/** clé Notion : env d'abord, sinon credentials.env (lecture server-only, jamais exposée au client) */
async function getNotionKey(): Promise<string | null> {
  if (process.env.NOTION_API_KEY) return process.env.NOTION_API_KEY;
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN;
  try {
    const raw = await readFile(CREDS_PATH, "utf8");
    const m = raw.match(/^(?:NOTION_API_KEY|NOTION_TOKEN|NOTION_SECRET|NOTION_INTERNAL_INTEGRATION_TOKEN)=(.+)$/m);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : null;
  } catch {
    return null;
  }
}

/**
 * Ping live api.notion.com/v1/users/me — preuve que le TOKEN est vivant (no-false-green).
 * Différent du registre filesystem `notion_dbs.json` (qui prouve l'intégration, pas la
 * fraîcheur du token). Le panneau d'auth peut ainsi distinguer GREEN-live de GREEN-cache.
 */
async function notionLivePing(): Promise<{ ok: boolean; status: number | null; who: string | null; reason?: string }> {
  const key = await getNotionKey();
  if (!key) return { ok: false, status: null, who: null, reason: "NOTION_API_KEY absent" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.notion.com/v1/users/me", {
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Notion-Version": "2022-06-28" },
    });
    let who: string | null = null;
    try {
      const j = (await res.json()) as Record<string, unknown>;
      const bot = j?.bot as Record<string, unknown> | undefined;
      who = (j?.name as string) ?? (bot?.workspace_name as string) ?? (j?.type as string) ?? null;
    } catch {
      // corps non-JSON : on garde who=null, le status fait foi
    }
    return { ok: res.ok, status: res.status, who };
  } catch (e) {
    return { ok: false, status: null, who: null, reason: e instanceof Error ? e.message : "FETCH_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const live = await notionLivePing();
  try {
    const dbsRaw = await readFile(`${STATE}/notion_dbs.json`, "utf8");
    const dbs = JSON.parse(dbsRaw) as Record<string, unknown>;
    const databases = Object.entries(dbs)
      .filter(
        ([, v]) =>
          v !== null &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          typeof (v as Record<string, unknown>).title === "string",
      )
      .map(([key, v]) => {
        const o = v as Record<string, unknown>;
        return {
          key,
          title: o.title as string,
          id:
            typeof o.id === "string"
              ? o.id
              : typeof o.database_id === "string"
                ? (o.database_id as string)
                : null,
        };
      });
    let sections: string[] = [];
    try {
      const secRaw = await readFile(`${STATE}/notion_section_pages.json`, "utf8");
      const sec = JSON.parse(secRaw) as unknown;
      sections = sec && typeof sec === "object" && !Array.isArray(sec) ? Object.keys(sec) : [];
    } catch {
      // section pages optional
    }
    return NextResponse.json(
      {
        ok: databases.length > 0,
        live,
        bootstrapAt: typeof dbs.bootstrap_at_utc === "string" ? dbs.bootstrap_at_utc : null,
        parent: typeof dbs.parent_control_tower === "string" ? dbs.parent_control_tower : null,
        databases,
        sections,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        live,
        reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        databases: [],
        sections: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
