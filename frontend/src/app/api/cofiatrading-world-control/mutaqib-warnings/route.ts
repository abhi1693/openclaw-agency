// MU'TAQIB doctrine drift warnings endpoint — non-blocking advisor feed
// source_tag: MUTAQIB_COCKPIT_API_V1_20260526T1245Z
// Owner agent: Guardian (existing canon §45 cap strict)
// Reads ~/.openclaw/state/mutaqib/warnings.jsonl — JSONL append-only
// Returns recent warnings + counts by level + by pattern

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

type Warning = {
  ts_utc: string;
  level: "info" | "warn" | "alert";
  pattern: string;
  source_path: string;
  snippet: string;
  recommendation: string;
  source_tag: string;
  agent_owner: string;
};

const WARNINGS_PATH = path.join(os.homedir(), ".openclaw/state/mutaqib/warnings.jsonl");
const MAX_RECENT = 50;

export async function GET() {
  try {
    let warnings: Warning[] = [];
    try {
      const content = await fs.readFile(WARNINGS_PATH, "utf-8");
      warnings = content
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return JSON.parse(l) as Warning;
          } catch {
            return null;
          }
        })
        .filter((w): w is Warning => w !== null);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      // file not yet created = no warnings = clean
    }

    // Sort most recent first
    warnings.sort((a, b) => b.ts_utc.localeCompare(a.ts_utc));

    // Window last 1h for "active" count
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const lastHour = warnings.filter((w) => w.ts_utc >= oneHourAgo);

    const counts = {
      total: warnings.length,
      last_1h: lastHour.length,
      by_level: { info: 0, warn: 0, alert: 0 } as Record<string, number>,
      by_pattern: {} as Record<string, number>,
    };
    for (const w of lastHour) {
      counts.by_level[w.level] = (counts.by_level[w.level] || 0) + 1;
      counts.by_pattern[w.pattern] = (counts.by_pattern[w.pattern] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      source_tag: "MUTAQIB_COCKPIT_API_V1_20260526T1245Z",
      runtime_ts: new Date().toISOString(),
      counts,
      recent: warnings.slice(0, MAX_RECENT),
      mode: "advisor_non_blocking",
      hardlock_canon: "§45 cap 38 agents strict — Mu'taqib = sentinel script operated by Guardian, pas un 39e agent",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
