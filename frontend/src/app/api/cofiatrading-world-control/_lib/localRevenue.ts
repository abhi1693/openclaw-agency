import { readFile } from "fs/promises";

/**
 * readLocalRevenue — source revenue LOCALE (cof_state.json), remplace le fallback Abidjan :8430.
 * Déménagement Abidjan→NY : aucune route NY ne doit faire de pipe HTTP vers :8430.
 * cof_state.json est le SSOT local (régénéré par Luffy/guardian, ttl 300s).
 * Renvoie une forme FetchResult drop-in + un payload revenue compatible avec les clés lues par
 * snapshot (mrr_eur/arr_eur/active_vip/brokers_commission_lifetime_usd/ftd_cumul/clients_active/brokers),
 * dawah-kpi (current_mrr_eur/active_vip), refresh-stripe-proof et green-action-log (mrr_eur/active_vip).
 * source_tag: NY_LOCAL_REVENUE_FROM_COF_STATE_NO_ABIDJAN_20260529
 */

const COF_STATE = "/Users/burakokyay/.openclaw/state/cof_state/cof_state.json";

type FetchResultLike = {
  ok: boolean;
  status: number | null;
  data: unknown;
  error: string | null;
};

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export async function readLocalRevenue(): Promise<FetchResultLike> {
  try {
    const readUtc = new Date().toISOString();
    const d = rec(JSON.parse(await readFile(COF_STATE, "utf8")));
    const r = rec(rec(d.hub_home).revenue);
    const crm = rec(rec(d.crm_commissions).current);
    const totals = rec(crm.totals);
    const brokersRaw = rec(crm.brokers);

    const mrr = num(r.mrr_eur) ?? num(r.stripe_mrr_eur);
    const arr = mrr != null ? mrr * 12 : null;
    const cofStateVip = num(r.stripe_active);

    const brokers: Record<string, { ftd: number; commission_lifetime_usd: number }> = {};
    for (const [k, v] of Object.entries(brokersRaw)) {
      const b = rec(v);
      brokers[k] = {
        ftd: num(b.ftd_count) ?? 0,
        commission_lifetime_usd: num(b.total_commissions) ?? 0,
      };
    }

    // Base = cof_state local (brokers/ftd/clients + MRR snapshot 300s).
    let mrrFinal = mrr;
    let arrFinal = arr;
    let vipFinal = cofStateVip;
    let pastDueEur: number | null = null;
    let pastDueCount: number | null = null;
    let sourceTag = "NY_LOCAL_REVENUE_FROM_COF_STATE_NO_ABIDJAN_20260529";
    let stripeOverlayOk = false;
    let stripeOverlayReadUtc: string | null = null;
    let pastDueReadUtc: string | null = null;

    // Overlay LIVE = backend NY host-natif :8000 (Stripe direct, non-Abidjan) si dispo. Fallback gracieux.
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1800);
      const [revRes, pdRes] = await Promise.all([
        fetch("http://127.0.0.1:8000/api/v1/cof/revenue/summary", { cache: "no-store", signal: ctrl.signal }),
        fetch("http://127.0.0.1:8000/api/v1/cof/past-due", { cache: "no-store", signal: ctrl.signal }),
      ]);
      clearTimeout(t);
      if (revRes.ok) {
        const rv = rec(await revRes.json());
        const liveMrr = num(rv.mrr_eur);
        if (liveMrr != null) {
          mrrFinal = liveMrr;
          arrFinal = liveMrr * 12;
          vipFinal = num(rv.active_count) ?? vipFinal;
          sourceTag = "NY_BACKEND_8000_STRIPE_LIVE_OVERLAY_NO_ABIDJAN_20260529";
          stripeOverlayOk = true;
          stripeOverlayReadUtc = readUtc;
        }
      }
      if (pdRes.ok) {
        const pd = rec(await pdRes.json());
        const totalEur = num(pd.total_eur);
        const items = Array.isArray(pd.items) ? pd.items : [];
        if (totalEur != null) pastDueEur = totalEur;
        else if (items.length) pastDueEur = items.reduce((s: number, it: unknown) => s + (num(rec(it).amount_due_eur) ?? 0), 0);
        pastDueCount = num(pd.items_count) ?? (items.length || null);
        pastDueReadUtc = readUtc;
      }
    } catch {
      /* backend down → on garde cof_state local, aucune régression */
    }

    const data = {
      ok: true,
      source_tag: sourceTag,
      read_utc: readUtc,
      stripe_overlay_ok: stripeOverlayOk,
      stripe_overlay_read_utc: stripeOverlayReadUtc,
      past_due_read_utc: pastDueReadUtc,
      cof_state_ts: rec(d.meta).ts_utc ?? null,
      cof_state_mrr_eur: mrr,
      cof_state_active_vip: cofStateVip,
      backend_8000_mrr_eur: stripeOverlayOk ? mrrFinal : null,
      backend_8000_active_vip: stripeOverlayOk ? vipFinal : null,
      revenue_delta_mrr_eur: mrr != null && mrrFinal != null ? Math.round((mrrFinal - mrr) * 100) / 100 : null,
      revenue_delta_active_vip: cofStateVip != null && vipFinal != null ? vipFinal - cofStateVip : null,
      revenue_consistency:
        stripeOverlayOk && ((mrr != null && mrrFinal != null && mrrFinal !== mrr) || (cofStateVip != null && vipFinal != null && vipFinal !== cofStateVip))
          ? "WATCH_BACKEND_8000_DIFFERS_FROM_COF_STATE"
          : "OK",
      mrr_eur: mrrFinal,
      mrr_active_eur: mrrFinal,
      current_mrr_eur: mrrFinal,
      arr_eur: arrFinal,
      current_arr_eur: arrFinal,
      active_vip: vipFinal,
      active_premium: null,
      active_elite: null,
      brokers_commission_lifetime_usd:
        num(r.brokers_commission_lifetime_usd) ?? num(totals.total_commissions),
      ftd_cumul: num(totals.ftd_count),
      clients_active: num(rec(d.iron).clients_total),
      past_due_count: pastDueCount,
      past_due_eur: pastDueEur,
      brokers,
    };

    return { ok: true, status: 200, data, error: null };
  } catch (error) {
    return {
      ok: false,
      status: null,
      data: null,
      error: error instanceof Error ? error.message : "COF_STATE_READ_ERROR",
    };
  }
}
