import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Source MRR = état Stripe DIRECT prouvé sur disque (LIVE_STRIPE_API), PAS :8430
// (qui calcule 879/7 par une autre méthode — non aligné sur l'API Stripe directe).
// revenue_loop/latest.json.stripe = vérité Stripe directe : mrr_eur, active_subscriptions.
// Aucune valeur en dur. Fraîcheur via generated_at_utc + max_age (jamais mtime seul).
const SOURCE_TAG = "CLAUDE_WORLD_MAP_MRR_PROXY_20260603";
const REVENUE_STATE = "/Users/burakokyay/.openclaw/state/revenue_loop/latest.json";
const MAX_AGE_SEC = 6 * 3600; // au-delà → stale (on n'affiche pas un chiffre périmé comme frais)

export async function GET() {
  const asOf = new Date().toISOString();
  try {
    const parsed = JSON.parse(await readFile(REVENUE_STATE, "utf8")) as {
      generated_at_utc?: string;
      stripe?: { mrr_eur?: number; active_subscriptions?: number; past_due_count?: number };
      targets?: { stripe_mrr_month_eur?: number };
    };
    const stripe = parsed.stripe ?? {};
    const mrrEur = typeof stripe.mrr_eur === "number" ? stripe.mrr_eur : null;
    const activeVip = typeof stripe.active_subscriptions === "number" ? stripe.active_subscriptions : null;
    const pastDue = typeof stripe.past_due_count === "number" ? stripe.past_due_count : null;
    const target = typeof parsed.targets?.stripe_mrr_month_eur === "number" ? parsed.targets.stripe_mrr_month_eur : null;
    const generatedAtUtc = typeof parsed.generated_at_utc === "string" ? parsed.generated_at_utc : null;
    const ageSec = generatedAtUtc ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(generatedAtUtc)) / 1000)) : null;
    const stale = ageSec === null || ageSec > MAX_AGE_SEC;
    // Tag réconciliation piloté par la DONNÉE réelle, pas forcé : cible MRR non atteinte → TARGET_FALSE_CURRENTLY.
    const reconcileTag = mrrEur !== null && target !== null && mrrEur < target ? "TARGET_FALSE_CURRENTLY" : "ON_TARGET";
    return NextResponse.json(
      { ok: mrrEur !== null && !stale, mrrEur, activeVip, pastDue, target, reconcileTag, stale, generatedAtUtc, ageSec, source: "LIVE_STRIPE_API:revenue_loop/latest.json", sourceTag: SOURCE_TAG, asOf },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, mrrEur: null, activeVip: null, pastDue: null, target: null, reconcileTag: "SOURCE_DOWN", stale: true, generatedAtUtc: null, ageSec: null, source: REVENUE_STATE, error: error instanceof Error ? error.message : "read_failed", sourceTag: SOURCE_TAG, asOf },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
