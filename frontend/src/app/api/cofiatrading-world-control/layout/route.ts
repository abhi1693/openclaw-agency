import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";

/* ══════════════════════════════════════════════════════════════════
 * Layout DURABLE de COFIATRADING WORLD CONTROL (positions maisons + caméra).
 * Erwin décide où sont les actifs : ses déplacements sont persistés dans un
 * fichier local (filesystem) → survit au refresh, au restart du serveur, au
 * changement d'origine (localhost/127.0.0.1) et de navigateur.
 * ADDITIF : ne touche AUCUNE donnée canon (registry/agents/snapshot). C'est une
 * couche de préférence Erwin par-dessus le layout par défaut.
 * GET → lit le layout. POST → écrit le layout (validé). DELETE → reset.
 * ════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LAYOUT_PATH =
  process.env.COF_WORLD_LAYOUT_PATH ?? join(homedir(), ".openclaw/state/cofiat_world_layout.json");

type Layout = {
  pos: Record<string, { x: number; y: number }>;
  cam: { z: number; tx: number; ty: number };
  updatedAt?: string;
};

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function sanitize(body: unknown): Layout {
  const b = (body ?? {}) as { pos?: unknown; cam?: unknown };
  const pos: Layout["pos"] = {};
  if (b.pos && typeof b.pos === "object") {
    for (const [k, v] of Object.entries(b.pos as Record<string, unknown>)) {
      const vv = v as { x?: unknown; y?: unknown };
      if (typeof vv?.x === "number" && typeof vv?.y === "number" && Number.isFinite(vv.x) && Number.isFinite(vv.y)) {
        // garde-fou : positions monde raisonnables (anti-corruption)
        pos[k] = { x: Math.max(-400, Math.min(500, vv.x)), y: Math.max(-400, Math.min(500, vv.y)) };
      }
    }
  }
  const c = (b.cam ?? {}) as { z?: unknown; tx?: unknown; ty?: unknown };
  const cam = { z: Math.max(0.2, Math.min(6, num(c.z, 1))), tx: num(c.tx, 0), ty: num(c.ty, 0) };
  return { pos, cam };
}

export async function GET() {
  try {
    const raw = await readFile(LAYOUT_PATH, "utf8");
    const data = JSON.parse(raw) as Layout;
    return NextResponse.json({ ok: true, source: "filesystem", path: LAYOUT_PATH, layout: sanitize(data) });
  } catch {
    return NextResponse.json({ ok: true, source: "filesystem", path: LAYOUT_PATH, layout: null, note: "no layout file yet — default canon layout" });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const layout: Layout = { ...sanitize(body), updatedAt: new Date().toISOString() };
    await mkdir(dirname(LAYOUT_PATH), { recursive: true });
    await writeFile(LAYOUT_PATH, JSON.stringify(layout, null, 2), "utf8");
    return NextResponse.json({ ok: true, saved: true, path: LAYOUT_PATH, houses: Object.keys(layout.pos).length, updatedAt: layout.updatedAt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "write_failed" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const empty: Layout = { pos: {}, cam: { z: 1, tx: 0, ty: 0 }, updatedAt: new Date().toISOString() };
    await mkdir(dirname(LAYOUT_PATH), { recursive: true });
    await writeFile(LAYOUT_PATH, JSON.stringify(empty, null, 2), "utf8");
    return NextResponse.json({ ok: true, reset: true, path: LAYOUT_PATH });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "reset_failed" }, { status: 500 });
  }
}
