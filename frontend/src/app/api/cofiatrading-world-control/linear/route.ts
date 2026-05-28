import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CREDS_PATH =
  process.env.COF_CREDENTIALS_ENV ?? "/Users/burakokyay/cof-trading/config/credentials.env";

type LinearNode = {
  identifier?: string;
  title?: string;
  priority?: number;
  state?: { name?: string; type?: string };
  team?: { key?: string };
  url?: string;
  updatedAt?: string;
};

async function getKey(): Promise<string | null> {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  try {
    const raw = await readFile(CREDS_PATH, "utf8");
    const m = raw.match(/^LINEAR_API_KEY=(.+)$/m);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const key = await getKey();
  if (!key) {
    return NextResponse.json(
      { ok: false, reason: "LINEAR_API_KEY absent", total: 0, issues: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        query:
          "{ issues(first: 20, orderBy: updatedAt) { nodes { identifier title priority state { name type } team { key } url updatedAt } } }",
      }),
    });
    const data = await res.json();
    const nodes: LinearNode[] = data?.data?.issues?.nodes ?? [];
    const issues = nodes.map((n) => ({
      id: n.identifier ?? "?",
      title: n.title ?? "",
      priority: typeof n.priority === "number" ? n.priority : null,
      state: n.state?.name ?? "?",
      stateType: n.state?.type ?? "?",
      team: n.team?.key ?? "?",
      url: n.url ?? null,
      updatedAt: n.updatedAt ?? null,
    }));
    return NextResponse.json(
      {
        ok: !data?.errors,
        total: issues.length,
        issues,
        error: data?.errors ? JSON.stringify(data.errors).slice(0, 180) : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "UNKNOWN_ERROR", total: 0, issues: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
