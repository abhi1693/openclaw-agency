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
    return NextResponse.json(
      { ok: true, houses: data?.houses ?? {}, source: REGISTRY_URL, fetchedAt: new Date().toISOString() },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "registry_unreachable", houses: {}, source: REGISTRY_URL },
      { status: 200 },
    );
  }
}
