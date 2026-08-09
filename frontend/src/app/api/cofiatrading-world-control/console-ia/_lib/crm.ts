import { mkdir, stat as statFile } from "fs/promises";
import path from "path";
import { asString, isRecord, sanitizeText } from "./schema";
import { appendJsonl, readJsonlTail } from "./fsUtils";
import { execFileAsync, STATE_ROOT, OPENCLAW_ROOT, CONSOLE_STATE_DIR, CAPTURED_EMAILS_FILE, EMAIL_RE } from "./runtime";
import { HUB_URL } from "./threads";

export const CRM_DB = path.join(STATE_ROOT, "iron_crm", "iron_crm_ultra_runtime.db");
export const REENGAGE_DB = path.join(OPENCLAW_ROOT, "data", "reengage_campaign.db");
export const REENGAGE_RED_DB = path.join(OPENCLAW_ROOT, "data", "reengage_campaign_red.db");
export const SQLITE3 = "/usr/bin/sqlite3";
export const CRM_SHEET_URL = "https://docs.google.com/spreadsheets/d/1jp40CxDl3TZx2aeHRvFM5-kbvOg31lCAiyZqzQPHrls";

export const crmNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(asString(v));
  return Number.isFinite(n) ? n : null;
};
export const safeTgId = (v: string) => (/^-?\d{1,20}$/.test(v) ? v : "");

// Requête sqlite lecture seule → lignes JSON. SELECT-only, fail-open=[].
export async function sqliteRows(db: string, sql: string): Promise<Record<string, unknown>[]> {
  try {
    const result = await execFileAsync(SQLITE3, ["-json", db, sql], { timeout: 8000, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
    const out = String(result.stdout ?? "");
    const t = out.trim();
    return t ? (JSON.parse(t) as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}
export const crmDbRows = (sql: string) => sqliteRows(CRM_DB, sql);

// Flux 9 — file des emails captés (sync + re-contact). Lecture : dernier email par tg.
export async function readCapturedEmails(): Promise<Record<string, string>> {
  const rows = await readJsonlTail<Record<string, unknown>>(CAPTURED_EMAILS_FILE, 5000, 1024 * 1024);
  const byTg: Record<string, string> = {};
  for (const r of rows) {
    const uid = sanitizeText(asString(r.uid), 40);
    const email = sanitizeText(asString(r.email), 120);
    if (uid && email) byTg[uid] = email;
  }
  return byTg;
}
// Capture un email client (append-only, dédup, jamais d'écriture dans la DB CRM live).
export async function captureEmail(uid: string, email: string, source: string) {
  try {
    if (!uid || !email) return;
    const norm = email.toLowerCase();
    if ((await readCapturedEmails())[uid] === norm) return;  // déjà capté
    await mkdir(CONSOLE_STATE_DIR, { recursive: true });
    await appendJsonl(CAPTURED_EMAILS_FILE, { uid, email: norm, source, at: new Date().toISOString() });
  } catch {
    // best-effort : la capture ne casse jamais l'affichage
  }
}

export type DepRow = { first: number | null; net: number | null; commission: number | null; ltv: number | null; churn: string };
export let _depCache: { mtimeMs: number; byUid: Record<string, DepRow> } | null = null;
export async function depositsByUid(): Promise<Record<string, DepRow>> {
  try {
    const st = await statFile(CRM_DB);
    if (_depCache && _depCache.mtimeMs === st.mtimeMs) return _depCache.byUid;
    const rows = await crmDbRows("SELECT uid, first_dep, net_dep, commission, ltv_score, churn_risk FROM broker_accounts");
    const byUid: Record<string, DepRow> = {};
    for (const r of rows) {
      const uid = asString(r.uid);
      if (uid) byUid[uid] = { first: crmNum(r.first_dep), net: crmNum(r.net_dep), commission: crmNum(r.commission), ltv: crmNum(r.ltv_score), churn: sanitizeText(asString(r.churn_risk), 20) };
    }
    _depCache = { mtimeMs: st.mtimeMs, byUid };
    return byUid;
  } catch {
    return {};
  }
}

// Totaux RÉELS (vrais chiffres, pas d'estimation) pour l'en-tête de la console.
export async function crmTotals() {
  const r = (await crmDbRows("SELECT (SELECT count(*) FROM clients) AS clients, (SELECT count(*) FROM clients WHERE telegram_id!='') AS clients_tg, (SELECT count(*) FROM clients WHERE temperature='HOT') AS hot, (SELECT count(*) FROM clients WHERE temperature='WARM') AS warm, (SELECT count(*) FROM broker_accounts) AS broker_accounts, (SELECT count(*) FROM broker_accounts WHERE CAST(first_dep AS REAL)>0) AS depositors, (SELECT round(sum(CAST(net_dep AS REAL))) FROM broker_accounts) AS net_dep_usd, (SELECT round(sum(CAST(commission AS REAL))) FROM broker_accounts) AS commission_usd"))[0] ?? {};
  const dm1 = crmNum((await sqliteRows(REENGAGE_DB, "SELECT count(DISTINCT user_id) n FROM dm_inbox_snapshot WHERE user_id IS NOT NULL"))[0]?.n) ?? 0;
  const dm2 = crmNum((await sqliteRows(REENGAGE_RED_DB, "SELECT count(DISTINCT user_id) n FROM dm_inbox_snapshot WHERE user_id IS NOT NULL"))[0]?.n) ?? 0;
  return {
    clients: crmNum(r.clients), clientsTg: crmNum(r.clients_tg), hot: crmNum(r.hot), warm: crmNum(r.warm),
    brokerAccounts: crmNum(r.broker_accounts), depositors: crmNum(r.depositors),
    netDepUsd: crmNum(r.net_dep_usd), commissionUsd: crmNum(r.commission_usd),
    dmContacts: dm1 + dm2, sheetUrl: CRM_SHEET_URL,
  };
}

export const clientFlags = (c: Record<string, unknown>, firstDep: number | null) => {
  const dealStage = sanitizeText(asString(c.deal_stage), 40).toUpperCase();
  const segment = sanitizeText(asString(c.segment), 40).toLowerCase();
  return ["VIP_ACTIVE", "CLIENT", "WON"].some((s) => dealStage.includes(s)) || segment.includes("paid") || (firstDep ?? 0) > 0;
};

// Profil 360 d'un client depuis la DB live (blob json frais + dépôt broker réel).
export async function clientProfileFromRow(row: Record<string, unknown>, tgId: string, resolvedBy: string) {
  let c: Record<string, unknown> = {};
  try { c = JSON.parse(asString(row.json)) as Record<string, unknown>; } catch { c = {}; }
  const pick = (k: string, max = 200) => sanitizeText(asString(c[k]), max);
  const brokerUid = asString(row.broker_uid) || pick("broker_uid", 60);
  const dep = (await depositsByUid())[brokerUid] || null;
  const dealStage = pick("deal_stage", 40);
  const segment = pick("segment", 40);
  const capturedEmail = (await readCapturedEmails())[tgId] || "";
  return {
    found: true,
    telegramId: tgId,
    resolvedBy,
    updatedAt: sanitizeText(asString(row.updated_at), 40),
    capturedEmail,
    identity: { name: pick("client_name"), username: pick("username"), country: pick("country"), language: pick("language"), email: pick("email", 120) || capturedEmail, phone: pick("phone", 40) },
    temperature: { label: pick("temperature", 20).toUpperCase(), score: crmNum(c.score), urgency: pick("urgency", 30) },
    money: {
      valueTier: pick("value_tier", 40).toUpperCase(),
      depositUsd: dep?.first ?? crmNum(c.deposit_usd), netDepositUsd: dep?.net ?? crmNum(c.net_deposit_usd),
      commissionUsd: dep?.commission ?? null, ltvScore: dep?.ltv ?? null, churnRisk: dep?.churn ?? "",
      redepositUsd: crmNum(c.redeposit_usd), broker: pick("broker", 40), brokerUid, moneyScore: crmNum(c.money_score),
    },
    subscription: { stripeStatus: pick("stripe_status", 30), stripePlan: pick("stripe_plan", 40), stripeAmountEur: crmNum(c.stripe_amount_eur), vipTelegram: pick("vip_telegram", 10), vipPerma: pick("vip_perma", 10), segment, dealStage, vipReason: pick("vip_invite_reason", 120) },
    risk: { riskScore: crmNum(c.risk_score), sentiment: pick("sentiment", 30), frustration: pick("frustration_level", 20) },
    timeline: { depositDate: pick("deposit_date", 40), lastDepositDate: pick("last_deposit_date", 40), daysSinceDeposit: pick("days_since_deposit", 20), lastContactUtc: crmNum(c.last_contact_utc), status: pick("status", 30) },
    context: {
      isClient: clientFlags(c, dep?.first ?? null),
      nextBestAction: pick("next_best_action_code", 60), nextAction: pick("next_action", 200),
      last3Facts: Array.isArray(c.last_3_facts) ? c.last_3_facts.map((f) => sanitizeText(asString(f), 200)).slice(0, 3) : [],
      lastMessageSummary: pick("last_message_summary", 300),
    },
  };
}

// Profil 360 : d'abord par telegram_id ; sinon FALLBACK par EMAIL capté (idée Erwin — l'email
// identifie la personne, fiable contrairement au nom). resolvedBy = "telegram_id" | "email".
export async function buildClient360(tgId: string) {
  const tg = safeTgId(tgId);
  const byTgRows = tg ? await crmDbRows(`SELECT json, broker_uid, updated_at FROM clients WHERE telegram_id='${tg}' LIMIT 1`) : [];
  if (byTgRows.length) return clientProfileFromRow(byTgRows[0], tgId, "telegram_id");
  const email = (await readCapturedEmails())[tgId] || "";
  if (email && EMAIL_RE.test(email)) {
    const safe = email.toLowerCase().replace(/'/g, "''");
    const byEmail = await crmDbRows(`SELECT json, broker_uid, updated_at FROM clients WHERE lower(email)='${safe}' LIMIT 1`);
    if (byEmail.length) return clientProfileFromRow(byEmail[0], tgId, "email");
  }
  return {
    found: false, telegramId: tgId, capturedEmail: email,
    note: email ? `Pas encore au CRM — email capté ${email} (file de sync)` : "Non recensé au CRM (prospect / lead non qualifié)",
  };
}

export type CrmLite = { temp: string; score: number | null; tier: string; stripe: string; isClient: boolean; firstDep: number | null };
export let _crmTgCache: { mtimeMs: number; byTg: Record<string, CrmLite> } | null = null;
// Map CRM léger par telegram_id (DB live, TOUS les clients) — pour la heat-map inbox + liste.
export async function crmLiteByTg(): Promise<Record<string, CrmLite>> {
  try {
    const st = await statFile(CRM_DB);
    if (_crmTgCache && _crmTgCache.mtimeMs === st.mtimeMs) return _crmTgCache.byTg;
    const rows = await crmDbRows("SELECT telegram_id, broker_uid, json FROM clients WHERE telegram_id IS NOT NULL AND telegram_id!=''");
    const dep = await depositsByUid();
    const byTg: Record<string, CrmLite> = {};
    for (const r of rows) {
      const tg = asString(r.telegram_id); if (!tg) continue;
      let c: Record<string, unknown> = {}; try { c = JSON.parse(asString(r.json)) as Record<string, unknown>; } catch { c = {}; }
      const d = dep[asString(r.broker_uid)] || null;
      byTg[tg] = {
        temp: sanitizeText(asString(c.temperature), 20).toUpperCase(),
        score: crmNum(c.score), tier: sanitizeText(asString(c.value_tier), 40).toUpperCase(),
        stripe: sanitizeText(asString(c.stripe_status), 30).toLowerCase(),
        isClient: clientFlags(c, d?.first ?? null), firstDep: d?.first ?? crmNum(c.deposit_usd),
      };
    }
    _crmTgCache = { mtimeMs: st.mtimeMs, byTg };
    return byTg;
  } catch {
    return {};
  }
}

// Liste TOUS les clients CRM (DB live) pour la vue "Tous les clients", classés chaud + dépôt.
export type AllClientRow = {
  userId: string; name: string; username: string; country: string;
  crmTemp: string; crmScore: number | null; crmTier: string; crmStripe: string;
  depositUsd: number | null; commissionUsd: number | null; isClient: boolean;
  brokerOnly: boolean; broker: string; churnRisk: string;
};
// Flux 7b — valeur de tri unifiée : un client est en haut s'il est CHAUD (score CRM) OU une
// grosse BALEINE (dépôt). max(score, dépôt normalisé) → hot-engagés ET gros déposants remontent.
export const rankValue = (r: AllClientRow) => Math.max(r.crmScore ?? 0, Math.min(110, Math.round((r.depositUsd ?? 0) / 300)));

// Vue "Tous les clients" : 270 clients CRM scorés (Telegram) UNION les déposants broker non liés
// (3282, vrais noms+montants, baleines à reconquérir). Toute la vraie donnée DB, classée chaud+argent.
export async function buildAllClients(limit = 500) {
  const dep = await depositsByUid();
  // 1) clients CRM scorés (avec Telegram)
  const crmRows = await crmDbRows("SELECT telegram_id, broker_uid, json FROM clients WHERE telegram_id IS NOT NULL AND telegram_id!=''");
  const scored: AllClientRow[] = crmRows.map((r) => {
    let c: Record<string, unknown> = {}; try { c = JSON.parse(asString(r.json)) as Record<string, unknown>; } catch { c = {}; }
    const d = dep[asString(r.broker_uid)] || null;
    return {
      userId: asString(r.telegram_id), name: sanitizeText(asString(c.client_name), 60) || asString(r.telegram_id),
      username: sanitizeText(asString(c.username), 60), country: sanitizeText(asString(c.country), 8),
      crmTemp: sanitizeText(asString(c.temperature), 20).toUpperCase(), crmScore: crmNum(c.score),
      crmTier: sanitizeText(asString(c.value_tier), 40).toUpperCase(), crmStripe: sanitizeText(asString(c.stripe_status), 30).toLowerCase(),
      depositUsd: d?.first ?? crmNum(c.deposit_usd), commissionUsd: d?.commission ?? null,
      isClient: clientFlags(c, d?.first ?? null), brokerOnly: false, broker: sanitizeText(asString(c.broker), 20), churnRisk: d?.churn ?? "",
    };
  });
  // 2) déposants broker NON liés au CRM (baleines sans Telegram mappé) — top par dépôt
  const depRows = await crmDbRows("SELECT uid, name, broker, country, first_dep, net_dep, commission, churn_risk FROM broker_accounts WHERE CAST(first_dep AS REAL)>0 AND (in_crm_clients=0 OR in_crm_clients IS NULL) AND name IS NOT NULL AND name!='' AND name NOT LIKE '%None%' ORDER BY CAST(first_dep AS REAL) DESC LIMIT 350");
  const brokerOnly: AllClientRow[] = depRows.map((r) => ({
    userId: `broker:${asString(r.uid)}`, name: sanitizeText(asString(r.name), 60), username: "", country: sanitizeText(asString(r.country), 8),
    crmTemp: "", crmScore: null, crmTier: "DÉPOSANT", crmStripe: "",
    depositUsd: crmNum(r.first_dep), commissionUsd: crmNum(r.commission), isClient: true,
    brokerOnly: true, broker: sanitizeText(asString(r.broker), 20), churnRisk: sanitizeText(asString(r.churn_risk), 20),
  }));
  return [...scored, ...brokerOnly].sort((a, b) => rankValue(b) - rankValue(a) || (b.depositUsd ?? 0) - (a.depositUsd ?? 0)).slice(0, limit);
}

// Flux 8 — pool DM Telethon (reengage erwin+red) : ~8757 contacts Telegram RÉELS, contactables
// (ont un tg + first_name/username). Dédupliqués, hors clients CRM déjà listés, récents d'abord.
export async function buildDmPool(limit = 400) {
  const crmTg = new Set(Object.keys(await crmLiteByTg()));
  const q = "SELECT user_id, username, first_name, last_msg_ts, last_msg_direction FROM dm_inbox_snapshot WHERE user_id IS NOT NULL AND user_id!='0' ORDER BY last_msg_ts DESC LIMIT 3000";
  const all = [...(await sqliteRows(REENGAGE_DB, q)), ...(await sqliteRows(REENGAGE_RED_DB, q))]
    .sort((a, b) => (Number(b.last_msg_ts) || 0) - (Number(a.last_msg_ts) || 0));
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const r of all) {
    const uid = String(r.user_id ?? "");  // user_id = INTEGER en DB → String(), pas asString()
    if (!uid || uid === "0" || uid === "777000" || uid === "42777" || seen.has(uid) || crmTg.has(uid)) continue;  // exclut comptes service Telegram
    seen.add(uid);
    out.push({
      userId: uid,
      name: sanitizeText(asString(r.first_name), 60) || (asString(r.username) ? `@${sanitizeText(asString(r.username), 50)}` : `#${uid}`),
      username: sanitizeText(asString(r.username), 60), country: "",
      crmTemp: "", crmScore: null, crmTier: "DM", crmStripe: "", depositUsd: null, commissionUsd: null,
      isClient: false, brokerOnly: false, broker: "", churnRisk: "", dmLead: true,
      lastTs: sanitizeText(asString(r.last_msg_ts), 30), lastDirection: sanitizeText(asString(r.last_msg_direction), 8),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// Flux 11 — COCKPIT vue d'ensemble : argent + santé, repris des endpoints hub VIVANTS de
// l'ancien hub (/api/kpis, /api/revenue/detailed, /api/health/bots — tous prouvés 200 réels).
// Lecture seule, fail-open par champ. Les endpoints morts (living-context, learning-events 502)
// + gardes dormants NE sont PAS intégrés (pas de pièce pourrie).
export async function buildCockpit() {
  const j = async (p: string): Promise<Record<string, unknown> | null> => {
    try {
      const r = await fetch(`${HUB_URL}${p}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
    } catch { return null; }
  };
  const [kpis, rev, health] = await Promise.all([j("/api/kpis"), j("/api/revenue/detailed"), j("/api/health/bots")]);
  const k = isRecord(kpis) ? kpis : {};
  const r = isRecord(rev) ? rev : {};
  const summary = isRecord(health) && isRecord(health.summary) ? health.summary : {};
  const brokers = isRecord(r.brokers)
    ? Object.entries(r.brokers).map(([id, b]) => ({
        id, name: isRecord(b) ? (asString(b.name) || id) : id,
        earned: isRecord(b) ? crmNum(b.earned ?? b.commission) : null,
      })).filter((x) => (x.earned ?? 0) > 0).sort((a, b) => (b.earned ?? 0) - (a.earned ?? 0))
    : [];
  return {
    live: !!kpis,
    mrrGross: crmNum(k.mrr_eur_gross), mrrCollected: crmNum(k.mrr_eur_collected),
    vipActive: crmNum(k.vip_count_active), ftdRate: crmNum(k.ftd_rate_pct),
    commissionLifetime: crmNum(r.total_earned), brokers,
    housesGreen: crmNum(k.houses_green), housesTotal: crmNum(k.houses_total),
    agentsAlive: crmNum(k.agents_alive_lt5min), agentsTotal: crmNum(k.agents_total),
    servicesTotal: crmNum(summary.total), servicesErrors: crmNum(summary.errors),
    truthClaimsOpen: crmNum(k.truth_claims_open),
    ts: sanitizeText(asString(k.ts), 40),
  };
}

// Envoi d'une note VOCALE à un client depuis la dashboard — proxy vers la brique média
// EXISTANTE du hub (/api/agent-oversight/send-media-b64, kind=voice → sendVoice).
// Transcode webm→ogg/opus avant envoi (vraie note vocale) + journalise le transcript.
// Gated : déclenché par un clic explicite. dryRun=true prouve le câblage sans envoyer.
