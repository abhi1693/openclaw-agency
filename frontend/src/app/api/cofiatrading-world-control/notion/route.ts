import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE = process.env.COF_OPENCLAW_STATE ?? "/Users/burakokyay/.openclaw/state";

export async function GET() {
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
        reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        databases: [],
        sections: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
