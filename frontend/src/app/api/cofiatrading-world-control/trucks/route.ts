import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import os from "os";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Sert le manifest canon des camions (flux inter-maisons réels).
// Source : ~/.openclaw/config/trucks_manifest.json (override COF_TRUCKS_MANIFEST_PATH).
const MANIFEST_PATH =
  process.env.COF_TRUCKS_MANIFEST_PATH ??
  path.join(os.homedir(), ".openclaw", "config", "trucks_manifest.json");

export async function GET() {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(
      {
        ok: true,
        source: MANIFEST_PATH,
        source_tag: data?.source_tag ?? null,
        sourced_count: data?.sourced_count ?? (Array.isArray(data?.trucks) ? data.trucks.length : 0),
        canon_target_count: data?.canon_target_count ?? null,
        honesty: data?.honesty ?? null,
        trucks: Array.isArray(data?.trucks) ? data.trucks : [],
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "trucks_manifest_unreadable", trucks: [], source: MANIFEST_PATH },
      { status: 200 },
    );
  }
}
