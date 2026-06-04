import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO_ROOT = "/Users/burakokyay/.openclaw/mission-control-frontend-restored";
const EXPECTED_REMOTE = "https://github.com/abhi1693/openclaw-mission-control.git";
const execFileAsync = promisify(execFile);

const readText = async (path: string) => {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
};

const readDirtyStatus = async () => {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: REPO_ROOT,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const entries = stdout.split("\n").filter((line) => line.trim());
    const counts = entries.reduce<Record<string, number>>((acc, line) => {
      const code = line.slice(0, 2);
      acc[code] = (acc[code] ?? 0) + 1;
      return acc;
    }, {});
    return {
      ok: true,
      dirtyCount: entries.length,
      counts,
      sample: entries.slice(0, 12),
    };
  } catch (error) {
    return {
      ok: false,
      dirtyCount: null,
      counts: {},
      sample: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export async function GET() {
  const config = await readText(`${REPO_ROOT}/.git/config`);
  const head = (await readText(`${REPO_ROOT}/.git/HEAD`)).trim();
  const branch = head.startsWith("ref: refs/heads/") ? head.replace("ref: refs/heads/", "") : "detached";
  const refPath = branch !== "detached" ? `${REPO_ROOT}/.git/refs/heads/${branch}` : "";
  const commit = refPath ? (await readText(refPath)).trim() : head;
  let mtimeUtc: string | null = null;
  try {
    mtimeUtc = (await stat(`${REPO_ROOT}/.git/config`)).mtime.toISOString();
  } catch {
    mtimeUtc = null;
  }
  const remoteOk = config.includes(EXPECTED_REMOTE);
  const dirty = await readDirtyStatus();
  const clean = dirty.ok && dirty.dirtyCount === 0;
  const status = remoteOk && commit && clean ? "GREEN_LOCAL_REMOTE_CLEAN" : dirty.ok && dirty.dirtyCount
    ? "WATCH_DIRTY_WORKTREE"
    : "AMBER_REVERIFY";
  return NextResponse.json(
    {
      ok: remoteOk && Boolean(commit) && clean,
      status,
      sourceTag: "OPENCLAW_MISSION_CONTROL_GITHUB_LOCAL_REMOTE_20260601",
      repoRoot: REPO_ROOT,
      expectedRemote: EXPECTED_REMOTE,
      remoteUrl: EXPECTED_REMOTE,
      branch,
      commit: commit || null,
      dirty,
      proof: remoteOk
        ? `${REPO_ROOT}/.git/config · origin=${EXPECTED_REMOTE} · branch=${branch} · commit=${commit.slice(0, 12)} · dirty_files=${dirty.dirtyCount ?? "UNKNOWN"}`
        : `${REPO_ROOT}/.git/config missing expected origin ${EXPECTED_REMOTE}`,
      mtimeUtc,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
