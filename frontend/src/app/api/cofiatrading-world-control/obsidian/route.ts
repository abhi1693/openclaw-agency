import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { readdir, readFile } from "fs/promises";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VAULT = process.env.COF_OBSIDIAN_VAULT ?? "/Users/burakokyay/Obsidian/COF_TRADING";
const execFileAsync = promisify(execFile);
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

const CURRENT_STATE = `${VAULT}/CURRENT_STATE.md`;

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
    let inFrontmatter = false;
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (t === "---") {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter || !t) continue;
      return t.replace(/^#+\s*/, "").slice(0, 120);
    }
    return null;
  } catch {
    return null;
  }
}

async function gitDirtyStatus() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: VAULT,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const entries = stdout.split("\n").filter((line) => line.trim());
    const counts = entries.reduce<Record<string, number>>((acc, line) => {
      const code = line.slice(0, 2);
      acc[code] = (acc[code] ?? 0) + 1;
      return acc;
    }, {});
    return { ok: true, dirtyCount: entries.length, counts, sample: entries.slice(0, 12) };
  } catch (error) {
    return {
      ok: false,
      dirtyCount: null,
      counts: {},
      sample: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function currentStateProof() {
  try {
    const [raw, fileStat] = await Promise.all([readFile(CURRENT_STATE, "utf8"), stat(CURRENT_STATE)]);
    const staleMarker = raw.includes("STALE_SUPERSEDED");
    return {
      exists: true,
      path: CURRENT_STATE,
      mtimeUtc: fileStat.mtime.toISOString(),
      bytes: fileStat.size,
      staleMarker,
      firstLine: raw.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("---"))?.slice(0, 160) ?? null,
    };
  } catch {
    return { exists: false, path: CURRENT_STATE, mtimeUtc: null, bytes: null, staleMarker: false, firstLine: null };
  }
}

async function recentMarkdownCount(maxAgeHours: number) {
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  let total = 0;
  for (const section of SECTIONS) {
    try {
      const entries = await readdir(`${VAULT}/${section}`, { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const filePath = `${entry.parentPath}/${entry.name}`;
        const fileStat = await stat(filePath);
        if (fileStat.mtimeMs >= cutoff) total += 1;
      }
    } catch {
      // Missing sections are already visible through note counts; keep recent count conservative.
    }
  }
  return total;
}

export async function GET() {
  const [sections, dirty, currentState, recent72h] = await Promise.all([
    Promise.all(SECTIONS.map(async (s) => ({ section: s, notes: await countMd(`${VAULT}/${s}`) }))),
    gitDirtyStatus(),
    currentStateProof(),
    recentMarkdownCount(72),
  ]);
  const total = sections.reduce((acc, s) => acc + s.notes, 0);
  const handoffs = {
    codex: await latestHandoff(`${VAULT}/06_SYNC/handoffs-codex/_latest.md`),
    claude: await latestHandoff(`${VAULT}/06_SYNC/handoffs-claude-code/_latest.md`),
    openclaw: await latestHandoff(`${VAULT}/06_SYNC/handoffs-openclaw/_latest.md`),
  };
  const clean = dirty.ok && dirty.dirtyCount === 0 && !currentState.staleMarker;
  const status = clean ? "LIVE_CLEAN" : dirty.ok && dirty.dirtyCount ? "WATCH_DIRTY_WORKTREE" : currentState.staleMarker
    ? "WATCH_STALE_CURRENT_STATE"
    : "AMBER_REVERIFY";
  return NextResponse.json(
    {
      ok: total > 0 && clean,
      status,
      sourceTag: "OBSIDIAN_FOUNDATION_NO_FALSE_GREEN_20260603",
      vault: VAULT,
      total,
      sections: sections.filter((s) => s.notes > 0),
      handoffs,
      git: dirty,
      currentState,
      recent72h,
      proof: `notes=${total} · dirty=${dirty.dirtyCount ?? "UNKNOWN"} · recent72h=${recent72h} · current_state_stale=${currentState.staleMarker}`,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
