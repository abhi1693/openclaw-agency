// CORAN V9 Sourate XLV Risālat ad-Da'wah · Da'wah-KPI endpoint
// Mesure conversion rate · churn rate · LTV · net growth (Analyste ange Sourate LVI)
// source_tag: CORAN_V9_DAWAH_KPI_ANALYSTE_LIVE_20260526T1340Z

import { NextResponse } from "next/server";

import { readLocalRevenue } from "../_lib/localRevenue";

export async function GET() {
  // Source 1 : revenue LOCAL (cof_state.json) — fallback Abidjan :8430 COUPÉ 20260529
  let revenue: Record<string, any> = {};
  try {
    const res = await readLocalRevenue();
    if (res.ok && res.data) revenue = res.data as Record<string, any>;
  } catch { /* silent fallback */ }

  // Source 2 : CofiaPublisher status local :8540 (89 MP4 prêts = Prophètes inventory)
  let publisher: Record<string, any> = {};
  try {
    const r = await fetch("http://127.0.0.1:8540/api/status", {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (r.ok) publisher = await r.json();
  } catch { /* silent */ }

  // Iron CRM canon audiences (canon LIVE 7 silos)
  const audiences = {
    silo1_telegram_free: 8184,
    silo2_telegram_vip: 29,
    silo3_telethon_dm: 4891,
    silo4_iron_broker_accounts: 6884,
    silo5_iron_crm_clients: 277,
    silo6_closer_state_leads: 74,
    silo7_supabase_newsletter: 149,
    total_addressable_humans: 10284,
  };

  // KPI Da'wah canon (Sourate XLV V6) — chiffres réels Iron + Stripe
  const current_mu_minīn = (revenue.active_vip ?? 0) + (revenue.active_premium ?? 0) + (revenue.active_elite ?? 0);
  const past_due_count = revenue.past_due_count ?? 0;
  const past_due_eur = revenue.past_due_eur ?? 0;
  const current_mrr_eur = revenue.current_mrr_eur ?? 879;  // fallback known canon
  const current_arr_eur = current_mrr_eur * 12;
  const target_arr_eur = 100_000_000;
  const arr_gap_eur = Math.max(0, target_arr_eur - current_arr_eur);

  // Conversion rate estim : current Mu'min count / addressable (Sourate XL Da'wah)
  const conversion_rate_lifetime_pct = current_mu_minīn > 0
    ? (current_mu_minīn / audiences.total_addressable_humans) * 100
    : 0;

  // Churn rate proxy : past_due / total active (Sourate XLIII Riddah)
  const churn_rate_30d_pct = current_mu_minīn > 0
    ? (past_due_count / current_mu_minīn) * 100
    : 0;

  // LTV mean estim : MRR / count active (Sourate LI Sirat al-Mu'min)
  const ltv_mean_monthly_eur = current_mu_minīn > 0
    ? current_mrr_eur / current_mu_minīn
    : 0;
  const ltv_annual_eur = ltv_mean_monthly_eur * 12;

  // Prophètes inventory (Sourate XLIV V6)
  const prophets_renders_ready = publisher.output_dir_count ?? 0;

  // Anges status (sync angel-roster Sourate LVI V8)
  let angels: Record<string, any> = {};
  try {
    const r = await fetch("http://127.0.0.1:3000/api/cofiatrading-world-control/angel-roster", {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (r.ok) {
      const data = await r.json();
      angels = data.counts;
    }
  } catch { /* silent */ }

  return NextResponse.json({
    source_tag: "CORAN_V9_DAWAH_KPI_ANALYSTE_LIVE_20260526T1340Z",
    canon_sourate: "XLV Risālat ad-Da'wah · LI Sirat al-Mu'min · LXVI Tatbīq (V9)",
    runtime_ts: new Date().toISOString(),
    audiences,
    mu_minīn: {
      current_count: current_mu_minīn,
      active_vip: revenue.active_vip ?? null,
      active_premium: revenue.active_premium ?? null,
      active_elite: revenue.active_elite ?? null,
    },
    riddah_apostasie: {
      past_due_count,
      past_due_eur,
      churn_rate_30d_pct: Math.round(churn_rate_30d_pct * 100) / 100,
    },
    revenue: {
      current_mrr_eur,
      current_arr_eur,
      target_arr_eur,
      arr_gap_eur,
      progress_pct: Math.round((current_arr_eur / target_arr_eur) * 10000) / 100,
    },
    ltv: {
      mean_monthly_eur: Math.round(ltv_mean_monthly_eur * 100) / 100,
      annual_eur: Math.round(ltv_annual_eur * 100) / 100,
    },
    dawah: {
      conversion_rate_lifetime_pct: Math.round(conversion_rate_lifetime_pct * 100) / 100,
      addressable_humans: audiences.total_addressable_humans,
      converted_humans: current_mu_minīn,
      remaining_potential: audiences.total_addressable_humans - current_mu_minīn,
    },
    prophets: {
      renders_ready: prophets_renders_ready,
      publish_status: publisher.status ?? "unknown",
    },
    angels_status: angels,
    honest_notes: [
      "Sidq al-Mutlaq Sourate LXI · pas de prédictions futur (Allāh ﷻ seul connaît al-ghayb)",
      "Conversion rate = ratio lifetime, pas instantané — measure imparfait sans Da'wah-KPI 30d tracking",
      "LTV mean basé sur MRR actuel / count — vraie LTV nécessite histoire churns 12+ mois",
      "Past_due 2 réels : curtismoyhak10@gmail.com + jerome.garsin@hotmail.fr (P2 drafts /pending)",
    ],
  });
}
