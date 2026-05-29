import { NextResponse } from "next/server";
import { getCofHost } from "../../../../lib/cof-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Proxy serveur-side vers le registry Central Brain :8767.
// Évite le localhost:8767 hardcodé côté navigateur (cassait hors machine locale / Vercel)
// et centralise la source de vérité des statuts maisons.
const HOST = getCofHost();
const REGISTRY_URL =
  process.env.COF_CENTRAL_BRAIN_REGISTRY_URL ??
  `${HOST}:8767/api/central-brain/registry`;

// Maisons dont le service backend est classé `on_demand` (dort par design via le governor).
// Source : ~/.openclaw/config/on_demand_runtime.json (on_demand_contains: "lightrag").
// obsidian_library (:9621) + lightrag_observatory sont backés par LightRAG → un statut
// SOURCE_DOWN/DEGRADED y signifie "endormi", PAS "cassé". On annote (sans falsifier le statut brut).
const ON_DEMAND_HOUSES = new Set<string>(["obsidian_library", "lightrag_observatory"]);

export async function GET() {
  try {
    const upstream = await fetch(REGISTRY_URL, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: `HTTP_${upstream.status}`, houses: {}, source: REGISTRY_URL },
        { status: 200 },
      );
    }
    const data = await upstream.json();
    const rawHouses = (data?.houses ?? {}) as Record<string, Record<string, unknown>>;
    const houses: Record<string, Record<string, unknown>> = {};
    for (const [id, v] of Object.entries(rawHouses)) {
      houses[id] = { ...v, on_demand: ON_DEMAND_HOUSES.has(id) };
    }
    return NextResponse.json(
      { ok: true, houses, source: REGISTRY_URL, fetchedAt: new Date().toISOString() },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "registry_unreachable", houses: {}, source: REGISTRY_URL },
      { status: 200 },
    );
  }
}
