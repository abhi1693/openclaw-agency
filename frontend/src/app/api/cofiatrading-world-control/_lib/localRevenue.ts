import { readFile } from "fs/promises";

/**
 * readLocalRevenue — source revenue LOCALE (cof_state.json), remplace le fallback Abidjan :8430.
 * Déménagement Abidjan→NY : aucune route NY ne doit faire de pipe HTTP vers :8430.
 * cof_state.json est le SSOT local (régénéré par Luffy/guardian, ttl 300s).
 * Renvoie une forme FetchResult drop-in + un payload revenue compatible avec les clés lues par
 * snapshot (mrr_eur/arr_eur/active_vip/brokers_commission_lifetime_usd/ftd_cumul/clients_active/brokers),
 * dawah-kpi (current_mrr_eur/active_vip) et refresh-stripe-proof (mrr_eur/active_vip).
 * source_tag: NY_LOCAL_REVENUE_FROM_COF_STATE_NO_ABIDJAN_20260529
 */

const COF_STATE = "/Users/burakokyay/.openclaw/state/cof_state/cof_state.json";

type FetchResultLike = {
  ok: boolean;
  status: number | null;
  data: unknown;
  error: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function readLocalRevenue(): Promise<FetchResultLike> {
  try {
    const raw = await readFile(COF_STATE, "utf8");
    const d = JSON.parse(raw);
    const r = d?.hub_home?.revenue ?? {};
    const totals = d?.crm_commissions?.current?.totals ?? {};
    const brokersRaw = d?.crm_commissions?.current?.brokers ?? {};

    const mrr = num(r.mrr_eur) ?? num(r.stripe_mrr_eur);
    const arr = mrr != null ? mrr * 12 : null;

    const brokers: Record<string, { ftd: number; commission_lifetime_usd: number }> = {};
    for (const [k, v] of Object.entries(brokersRaw)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = v as any;
      brokers[k] = {
        ftd: num(b?.ftd_count) ?? 0,
        commission_lifetime_usd: num(b?.total_commissions) ?? 0,
      };
    }

    const data = {
      ok: true,
      source_tag: "NY_LOCAL_REVENUE_FROM_COF_STATE_NO_ABIDJAN_20260529",
      cof_state_ts: d?.meta?.ts_utc ?? null,
      mrr_eur: mrr,
      mrr_active_eur: mrr,
      current_mrr_eur: mrr,
      arr_eur: arr,
      current_arr_eur: arr,
      active_vip: num(r.stripe_active),
      active_premium: null,
      active_elite: null,
      brokers_commission_lifetime_usd: num(r.brokers_commission_lifetime_usd) ?? num(totals.total_commissions),
      ftd_cumul: num(totals.ftd_count),
      clients_active: num(d?.iron?.clients_total),
      // past_due non porté par cof_state.hub_home.revenue ; les routes l'override (Stripe direct) ou l'ignorent.
      past_due_count: null,
      past_due_eur: null,
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
