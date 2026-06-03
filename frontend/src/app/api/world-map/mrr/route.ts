import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Proxy mince → source revenue canonique (:8430). Renvoie le MRR RÉEL live.
// Pas de valeur en dur : si la source est down, mrrEur=null (le widget affiche "indisponible",
// jamais un chiffre inventé). Isolé exprès du sync route Codex pour éviter toute collision.
const SOURCE_TAG = "CLAUDE_WORLD_MAP_MRR_PROXY_20260603";
const REVENUE_URL = "http://127.0.0.1:8430/api/iron/revenue/summary";

export async function GET() {
  const asOf = new Date().toISOString();
  try {
    const res = await fetch(REVENUE_URL, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, mrrEur: null, activeVip: null, source: REVENUE_URL, status: res.status, asOf, sourceTag: SOURCE_TAG },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }
    const data = (await res.json()) as { mrr_eur?: number; active_vip?: number };
    const mrrEur = typeof data.mrr_eur === "number" ? data.mrr_eur : null;
    const activeVip = typeof data.active_vip === "number" ? data.active_vip : null;
    return NextResponse.json(
      { ok: mrrEur !== null, mrrEur, activeVip, source: REVENUE_URL, asOf, sourceTag: SOURCE_TAG },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, mrrEur: null, activeVip: null, source: REVENUE_URL, error: error instanceof Error ? error.message : "fetch_failed", asOf, sourceTag: SOURCE_TAG },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
