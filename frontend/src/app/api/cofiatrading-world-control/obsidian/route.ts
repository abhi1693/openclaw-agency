import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VAULT = process.env.COF_OBSIDIAN_VAULT ?? "/Users/burakokyay/Obsidian/COF_TRADING";
const SECTIONS = [
  "00_INBOX",
  "01_DASHBOARD",
  "02_AGENTS",
  "03_KNOWLEDGE",
  "04_OPERATIONS",
  "05_LIVE",
  "06_SYNC",
  "07_RESEARCH",
  "08_REPORTS",
  "09_TEMPLATES",
  "10_PROJECTS",
  "11_ARCHIVES",
];

async function countMd(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { recursive: true });
    return entries.filter((e) => typeof e === "string" && e.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

async function latestHandoff(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf8");
    const firstLine = raw.split("\n").find((l) => l.trim().length > 0) ?? "";
    return firstLine.replace(/^#+\s*/, "").slice(0, 120) || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const sections = await Promise.all(
    SECTIONS.map(async (s) => ({ section: s, notes: await countMd(`${VAULT}/${s}`) })),
  );
  const total = sections.reduce((acc, s) => acc + s.notes, 0);
  const handoffs = {
    codex: await latestHandoff(`${VAULT}/06_SYNC/handoffs-codex/_latest.md`),
    claude: await latestHandoff(`${VAULT}/06_SYNC/handoffs-claude-code/_latest.md`),
    openclaw: await latestHandoff(`${VAULT}/06_SYNC/handoffs-openclaw/_latest.md`),
  };
  return NextResponse.json(
    {
      ok: total > 0,
      total,
      sections: sections.filter((s) => s.notes > 0),
      handoffs,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
