import { readFile } from "fs/promises";

/**
 * house-kpis — KPIs réels PAR MAISON pour l'inspecteur (déménagement Abidjan→New York).
 * Règle dure : AUCUN pipe Abidjan :8430. Sources autorisées = fichiers d'état LOCAUX uniquement
 * (cof_state.json SSOT + snapshots/manifests locaux). Zéro invention : si pas de source → gap honnête.
 * source_tag : HOUSE_KPIS_LOCAL_NO_ABIDJAN_20260529
 */

const HOME = "/Users/burakokyay";
const COF_STATE = `${HOME}/.openclaw/state/cof_state/cof_state.json`;
const SITE_SNAP = `${HOME}/cof-trading/cofiatrading-site/state/cofiatrading_mission_control_snapshot.json`;
const WARNINGS = `${HOME}/.openclaw/state/mutaqib/warnings.jsonl`;
const LIGHTRAG_AUDIT = `${HOME}/.openclaw/state/lightrag_storage_hygiene_audit.json`;
const LIGHTRAG_MANIFEST = `${HOME}/.openclaw/state/lightrag_manifest.json`;
const NOTION_DBS = `${HOME}/.openclaw/state/notion_dbs.json`;
const PAPERCLIP_CARDS = `${HOME}/.openclaw/state/paperclip_cards/cards.jsonl`;

type Kpi = { label: string; value: string; source?: string };
type House = { kpis: Kpi[]; gap?: string };

const fr = (n: unknown): string =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("fr-FR") : "UNKNOWN";

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function readJsonl(path: string): Promise<string[]> {
  try {
    return (await readFile(path, "utf8")).split("\n").filter((l) => l.trim());
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = (o: any, ...keys: string[]): any => keys.reduce((a, k) => (a == null ? a : a[k]), o);

export async function GET() {
  const cof = await readJson(COF_STATE);
  const site = await readJson(SITE_SNAP);
  const warnLines = await readJsonl(WARNINGS);
  const lrAudit = await readJson(LIGHTRAG_AUDIT);
  const lrManifest = await readJson(LIGHTRAG_MANIFEST);
  const notion = await readJson(NOTION_DBS);
  const cards = await readJsonl(PAPERCLIP_CARDS);

  const houses: Record<string, House> = {};
  const SRC_COF = "cof_state.json (local SSOT, non-Abidjan)";

  // ── mt4_signal_tower : trading_exec + paper_trading + vip_broadcaster
  if (cof) {
    houses.mt4_signal_tower = {
      kpis: [
        { label: "Dernier signal #", value: fr(g(cof, "trading_exec", "last_signal_id")), source: SRC_COF } as Kpi,
        { label: "Ordres placés / refusés", value: `${fr(g(cof, "trading_exec", "orders_placed"))} / ${fr(g(cof, "trading_exec", "orders_refused"))}`, source: SRC_COF } as Kpi,
        { label: "PnL jour (USD)", value: fr(g(cof, "trading_exec", "daily_pnl_usd")), source: SRC_COF } as Kpi,
        { label: "Paper winrate", value: `${fr(g(cof, "paper_trading", "last_report", "metrics", "winrate_pct"))} %`, source: SRC_COF } as Kpi,
        { label: "VIP broadcaster", value: g(cof, "system_status", "vip_broadcaster", "running") ? "LIVE" : "DOWN", source: SRC_COF } as Kpi,
      ],
    };

    // ── vip_gate : iron + iron_health
    houses.vip_gate = {
      kpis: [
        { label: "Clients CRM", value: fr(g(cof, "iron", "clients_total")), source: SRC_COF } as Kpi,
        { label: "VIP accordés", value: fr(g(cof, "iron", "vip_granted")), source: SRC_COF } as Kpi,
        { label: "Funnel conversion", value: `${fr(g(cof, "iron_health", "funnel", "conversion_rate_pct"))} % (${fr(g(cof, "iron_health", "funnel", "total_users"))} users)`, source: SRC_COF } as Kpi,
        { label: "TTFR p50 / p95", value: `${fr(g(cof, "iron_health", "ttfr", "p50_sec"))}s / ${fr(g(cof, "iron_health", "ttfr", "p95_sec"))}s`, source: SRC_COF } as Kpi,
        { label: "Interactions 24h (in/out)", value: `${fr(g(cof, "iron", "inbound_24h"))} / ${fr(g(cof, "iron", "outbound_24h"))}`, source: SRC_COF } as Kpi,
      ],
    };

    // ── iron_office : cash / clients / stripe (cof_state, PAS Abidjan revenue summary)
    houses.iron_office = {
      kpis: [
        { label: "Clients CRM", value: fr(g(cof, "iron", "clients_total")), source: SRC_COF } as Kpi,
        { label: "Stripe subs actifs", value: fr(g(cof, "iron_health", "stripe", "active_subs")), source: SRC_COF } as Kpi,
        { label: "VIP (perma/stripe/broker)", value: `${fr(g(cof, "iron_health", "vip", "perma"))} / ${fr(g(cof, "iron_health", "vip", "stripe_managed"))} / ${fr(g(cof, "iron_health", "vip", "broker_90d"))}`, source: SRC_COF } as Kpi,
        { label: "Help pending / résolu %", value: `${fr(g(cof, "iron_health", "help", "pending"))} / ${fr(g(cof, "iron_health", "help", "resolve_rate_pct"))} %`, source: SRC_COF } as Kpi,
        { label: "Promesses en attente", value: fr(g(cof, "iron", "promises_pending")), source: SRC_COF } as Kpi,
      ],
    };

    // ── mission_control_tower : santé système (cof_state.meta + system_status)
    houses.mission_control_tower = {
      kpis: [
        { label: "Sections cof_state OK", value: `${fr(g(cof, "meta", "sections_ok"))} / ${fr(g(cof, "meta", "sections_total"))}`, source: SRC_COF } as Kpi,
        { label: "Hub services up", value: `${fr(g(cof, "system_status", "hub", "running"))} / ${fr(g(cof, "system_status", "hub", "total"))}`, source: SRC_COF } as Kpi,
        { label: "Guardian heartbeat", value: g(cof, "system_status", "guardian", "heartbeat_running") ? `LIVE (${fr(g(cof, "system_status", "guardian", "heartbeat_age_sec"))}s)` : "DOWN", source: SRC_COF } as Kpi,
        { label: "Data source trading", value: `${g(cof, "system_status", "data_source", "status") ?? "?"} (${g(cof, "system_status", "data_source", "provider") ?? "?"})`, source: SRC_COF } as Kpi,
      ],
    };

    // ── paperclip_factory : system_status.paperclip + cards
    houses.paperclip_factory = {
      kpis: [
        { label: "Service", value: g(cof, "system_status", "paperclip", "up") ? `up (${g(cof, "system_status", "paperclip", "status") ?? "ok"})` : "down", source: SRC_COF } as Kpi,
        { label: "Cards en file", value: fr(cards.length), source: "paperclip_cards/cards.jsonl (local)" } as Kpi,
      ],
    };
  }

  // ── compliance_port : warnings.jsonl (mutaqib, local)
  {
    const byLevel = { info: 0, warn: 0, alert: 0 } as Record<string, number>;
    let last: Record<string, unknown> | null = null;
    for (const l of warnLines) {
      try {
        const o = JSON.parse(l);
        const lv = String(o.level ?? "info");
        byLevel[lv] = (byLevel[lv] ?? 0) + 1;
        last = o;
      } catch { /* skip */ }
    }
    houses.compliance_port = {
      kpis: [
        { label: "Warnings total", value: fr(warnLines.length), source: "mutaqib/warnings.jsonl (local)" } as Kpi,
        { label: "Par niveau", value: `${fr(byLevel.alert)} alert · ${fr(byLevel.warn)} warn · ${fr(byLevel.info)} info`, source: "mutaqib/warnings.jsonl" } as Kpi,
        { label: "Dernier pattern", value: last ? String(last.pattern ?? last.level ?? "—") : "—", source: "mutaqib/warnings.jsonl" } as Kpi,
      ],
    };
  }

  // ── site_seo_lab : site snapshot local
  if (site) {
    houses.site_seo_lab = {
      kpis: [
        { label: "Leads 7j", value: fr(g(site, "acquisition", "leads_7d")), source: "cofiatrading-site/state snapshot (local)" } as Kpi,
        { label: "Checkout intents 7j", value: fr(g(site, "acquisition", "checkout_intents_7d")), source: "site snapshot" } as Kpi,
        { label: "Nouveaux VIP 7j", value: fr(g(site, "acquisition", "new_vip_7d")), source: "site snapshot" } as Kpi,
        { label: "Subs actifs / past_due", value: `${fr(g(site, "revenue", "active_subscriptions"))} / ${fr(g(site, "revenue", "recoverable_past_due_mrr"))}€`, source: "site snapshot" } as Kpi,
      ],
    };
    // calendar : seul KPI non-Abidjan dispo = events_to_dec31 du site snapshot ; reste = gap
    houses.calendar_tower = {
      kpis: [
        { label: "Events → 31 déc", value: fr(g(site, "calendar", "events_to_dec31")), source: "site snapshot (local)" } as Kpi,
      ],
      gap: "Calendar live (events à venir) : seule route NY pointe Abidjan :8430 → backend NY requis pour parité complète.",
    };
  } else {
    houses.calendar_tower = { kpis: [], gap: "Calendar : source non-Abidjan absente → backend NY requis." };
  }

  // ── obsidian_library : notion DBs + lightrag manifest (lectures cheap, local)
  houses.obsidian_library = {
    kpis: [
      { label: "Notion DBs", value: fr(Array.isArray(g(notion, "dbs")) ? (g(notion, "dbs") as unknown[]).length : g(notion, "count")), source: "notion_dbs.json (local)" } as Kpi,
      { label: "Fichiers RAG ciblés", value: fr(g(lrManifest, "total_files")), source: "lightrag_manifest.json (local)" } as Kpi,
    ],
  };

  // ── lightrag_observatory : audit hygiène corpus
  houses.lightrag_observatory = {
    kpis: [
      { label: "Docs corpus", value: fr(g(lrAudit, "doc_count")), source: "lightrag_storage_hygiene_audit.json (local)" } as Kpi,
      { label: "Pending / processed", value: `${fr(g(lrAudit, "status_counts", "pending"))} / ${fr(g(lrAudit, "status_counts", "processed"))}`, source: "lightrag audit" } as Kpi,
      { label: "Fichiers ciblés (manifest)", value: fr(g(lrManifest, "total_files")), source: "lightrag_manifest.json" } as Kpi,
    ],
  };

  // ── trading_academy : maison DEFERRED (gap honnête, pas de runtime)
  houses.trading_academy = {
    kpis: [],
    gap: "Maison DEFERRED_2027 (aucun asset P0 runtime). Contenu = fichiers academy.mdx du site ; pas d'état live à migrer.",
  };

  return Response.json({
    ok: true,
    source_tag: "HOUSE_KPIS_LOCAL_NO_ABIDJAN_20260529",
    cof_state_ts: cof ? g(cof, "meta", "ts_utc") : null,
    houses,
  });
}
