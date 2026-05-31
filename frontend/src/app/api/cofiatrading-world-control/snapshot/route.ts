import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

import { readLocalRevenue } from "../_lib/localRevenue";
import { getCofHost, getOpenClawApiBase, getLocalAuthToken } from "../../../../lib/cof-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FetchResult = {
  ok: boolean;
  status: number | null;
  data: unknown;
  error: string | null;
};

const HOST = getCofHost();
const OPENCLAW_API = getOpenClawApiBase();
const LOCAL_AUTH_TOKEN = getLocalAuthToken();
const execFileAsync = promisify(execFile);

const endpoints = {
  revenue: "local://cof_state.json (readLocalRevenue — fallback Abidjan :8430 COUPÉ 20260529)",
  houses: process.env.COF_CENTRAL_BRAIN_HOUSES_URL ?? `${HOST}:8767/api/central-brain/houses`,
  publisher: process.env.COF_PUBLISHER_STATUS_URL ?? `${HOST}:8540/api/status`,
  ack: process.env.COF_ACK_HEALTH_URL ?? `${HOST}:8443/health`,
  rtk: process.env.COF_RTK_HEALTH_URL ?? `${HOST}:11435/rtk/health`,
  proofLedger: process.env.COF_PROOF_LEDGER_HOME_URL ?? `${HOST}:8430/api/mission-control/home`,
};

// Services canon probes LIVE (cockpit Hub Vivant). OpenClaw official local network
// model = one loopback Gateway on :18789; legacy duplicate ports are not canon.
const SERVICE_PROBES: ReadonlyArray<{ id: string; label: string; url: string; role: string; onDemand?: boolean }> = [
  { id: "hub_8430", label: "Hub :8430", url: `${HOST}:8430/cofiacontrol.html`, role: "Hub principal Iron + revenue + chat" },
  { id: "mission_control_3000", label: "Mission Control :3000", url: `${HOST}:3000/cofiatrading-world-control`, role: "Cockpit Hub Vivant NY" },
  { id: "central_brain_8767", label: "Central Brain :8767", url: `${HOST}:8767/api/central-brain/houses`, role: "Registry 15 maisons SSOT" },
  { id: "cofiapublisher_8540", label: "CofiaPublisher :8540", url: `${HOST}:8540/api/status`, role: "Pipeline vidéos 89 MP4" },
  { id: "openclaw_gateway_18789", label: "OpenClaw Gateway :18789", url: `${HOST}:18789/health`, role: "Gateway OpenClaw/Lobster runtime" },
  { id: "inventory_8433", label: "Inventory :8433", url: `${HOST}:8433/health`, role: "Living Inventory canon", onDemand: true },
  { id: "llm_proxy_11435", label: "rtk-llm-proxy :11435", url: `${HOST}:11435/rtk/health`, role: "Gemini/Qwen routing local" },
  { id: "lightrag_9621", label: "LightRAG :9621", url: `${HOST}:9621/health`, role: "Semantic graph recall" },
  { id: "paperclip_3100", label: "Paperclip :3100", url: `${HOST}:3100/api/health`, role: "Universal assets pipeline" },
];

// P11 Sourate LXV Adwāt al-Mu'minīn · 20 boutiques commerciales canon (machine 100M€ Déc 2026)
type CommerceShop = {
  id: string;
  name: string;
  status: "LIVE" | "PARTIAL" | "CANON_GATE" | "AWAITING_SETUP" | "BROKEN";
  problem: string;
  next_action: string;
  owner_agent: string;
  proof_source: string;
};
const COMMERCE_MACHINE_CANON: ReadonlyArray<CommerceShop> = [
  { id: "instagram", name: "Instagram @cofiatrading", status: "AWAITING_SETUP", problem: "Token IG valide V9, 10 posts existants mais bio basique, 0 stories quotidiennes, 0 DM <4h, 0 grid cohérent", next_action: "Update bio brand-kit + premier carousel premium W22 + 3 stories/jour cron", owner_agent: "Malik al-Insta", proof_source: "Meta Graph API ig_user_id link Page" },
  { id: "youtube", name: "YouTube CofiaPublisher V30", status: "CANON_GATE", problem: "89 MP4 prêts ~/cof-trading/remotion/out/, 0 publié, OAuth refresh expiré, channel art absent", next_action: "OAuth refresh Erwin 2min + publish video-01 unlisted → Reviewer GREEN → public + channel art brand", owner_agent: "Nova + Isrāfīl", proof_source: "ls remotion/out/*.mp4 + Reviewer GREEN gate" },
  { id: "facebook", name: "Facebook Page COFIA Trading", status: "AWAITING_SETUP", problem: "Page 1136548789543573 existe, about/desc/cover/profile VIDES, 0 followers, Meta Verified ⭐ payé non appliqué", next_action: "Upload cover + profile + about + premier post + soumettre Verified Application", owner_agent: "Luna", proof_source: "Meta Graph API page_token + brand-kit-2026-05" },
  { id: "tiktok", name: "TikTok", status: "AWAITING_SETUP", problem: "TIKTOK_ACCESS_TOKEN placeholder, 0 short publié, profile vide", next_action: "Génère token dev portal (Erwin 10min) + Sonic cron 1 short/jour debunk", owner_agent: "Sonic", proof_source: "TikTok Developer Portal app" },
  { id: "telegram_free", name: "Telegram FREE -1001279616913", status: "LIVE", problem: "4891 members, broadcasts sporadiques, pas de cadence hebdo soignée", next_action: "Broadcast educational hebdo W22 captions premium V8/V12 + sondages mensuels", owner_agent: "Sonic + David", proof_source: "Hub :8430/api/iron/chat/send + 78452 msg IDs récents" },
  { id: "telegram_vip", name: "Telegram VIP", status: "LIVE", problem: "29 members, sous-utilisé pour Welcome flow + signaux quotidiens", next_action: "Welcome flow auto post-Stripe + 1 signal STRAT-17 quotidien Marco", owner_agent: "Antho + Marco", proof_source: "Stripe webhook → Telegram VIP invite" },
  { id: "whatsapp_business", name: "WhatsApp Business WABA US", status: "PARTIAL", problem: "Phone +1 555-964-8716 VERIFIED, template cofia_welcome_vip_fr PENDING Meta ~24h, 0 message envoyé", next_action: "Wait approval template + send 3 brokers + onboarding VIP", owner_agent: "David + Jack", proof_source: "Meta Graph waba_id 1320675216711048 template review" },
  { id: "gmail_brokers", name: "Gmail brokers reclaim", status: "PARTIAL", problem: "3 drafts (Nicolas/Fabienne/François) JAMAIS sent depuis 24h+", next_action: "Send via Gmail API Python OAuth refresh_token OR WhatsApp template approved", owner_agent: "Jack", proof_source: "Gmail drafts r-1313936... r-885955... r-412545..." },
  { id: "stripe", name: "Stripe", status: "LIVE", problem: "MRR/VIP/past_due lus depuis le backend NY live, jamais figés dans le snapshot", next_action: "Comparer snapshot ↔ :8000/api/v1/cof/past-due avant toute relance past_due", owner_agent: "Mikā'īl", proof_source: "readLocalRevenue + backend NY :8000 Stripe read-only" },
  { id: "brokers_cellxpert", name: "Brokers CellXpert", status: "CANON_GATE", problem: "6884 broker_accounts Default, IP whitelist ES pending, 4 brokers (FXcess/IronFX/RaiseFX/Libertex) PDFs daily 0 dispatched", next_action: "IP whitelist fix + dispatch quotidien WhatsApp/Gmail PDF reclaim", owner_agent: "Jack", proof_source: "broker_accounts Iron CRM + affiliate_contacts.json" },
  { id: "notion", name: "Notion workspace", status: "PARTIAL", problem: "3 DBs créées (38 Anges + 4 Leviers + 11 Prices), pas de sync cron Hub↔Notion ni orders canon", next_action: "Script notion_to_orders.py LaunchAgent 1h + Welcome VIP page template + canon docs B2B", owner_agent: "Steward + Antho", proof_source: "Notion API 3 DBs ID 7a2d1ad6 + 7c54ea95 + 4e93d058" },
  { id: "linear", name: "Linear cofiatrading team", status: "LIVE", problem: "76+ issues, 4 doublons §21 fermés 27/05, pas de cycles structurés ni projects par 4 leviers", next_action: "Cycles 2 weekly + projects par 4 leviers ROI + roadmap visible Hub", owner_agent: "Sentinel", proof_source: "Linear MCP list_issues team Cofiatrading" },
  { id: "github", name: "GitHub @erwin-cmyk", status: "LIVE", problem: "Auto-commit branche feature OK, repos pas propres, README absents, pas de CI/CD ni topics", next_action: "README pro tous repos + badges + topics + GitHub Actions CI/CD", owner_agent: "Atlas + Codex", proof_source: "github.com/erwin-cmyk audit repos" },
  { id: "vercel", name: "Vercel cofiatrading.com", status: "PARTIAL", problem: "Site déployé, landing pages SEO i18n incomplet, pas de tracking conversions ni Meta Pixel", next_action: "i18n EN/FR/ES/AR/TR + analytics + Meta Pixel CAPI v22", owner_agent: "Atlas", proof_source: "vercel.app cof-trading-site project" },
  { id: "supabase", name: "Supabase pxynrgypfkoyuixsxvsj", status: "LIVE", problem: "9 advisors security RLS always_true backdoor (COF-130 P0), 149 emails newsletter jamais envoyée", next_action: "Fix RLS policies + envoyer newsletter weekly via Resend re-activé", owner_agent: "Atlas + Mikā'īl", proof_source: "Supabase MCP get_advisors security warnings" },
  { id: "n8n", name: "n8n coftrading.app.n8n.cloud", status: "PARTIAL", problem: "9 workflows ACTIVE dont fan-out publish, erreurs config + credentials sync manquantes", next_action: "Audit + fix workflows erreurs + credentials sync + webhook publish-approve", owner_agent: "Steward", proof_source: "n8n cloud workflow id kXojepCAXV5ktVsf" },
  { id: "cofiapublisher", name: "CofiaPublisher pipeline V30", status: "LIVE", problem: "Server :8540 LIVE, 89 MP4 prêts, 0 publié, drawer Hub UI absent, ferrari-refresh LA pas installé", next_action: "Install LaunchAgent ferrari-refresh 300s + drawer cof-island-v21.html + Gemini Vision J+3", owner_agent: "Nova", proof_source: "curl :8540/api/status LIVE + 89 .mp4 remotion/out/" },
  { id: "hedra", name: "Hedra Character-3 lipsync", status: "AWAITING_SETUP", problem: "$30/mo PAYÉ depuis 2026-05-18, HEDRA_API_KEY not set, 6 tentatives FAILED (faux-vert)", next_action: "Set HEDRA_API_KEY env + premier video talking-head Erwin Menorca + ElevenLabs voice clone", owner_agent: "Nova + Luna", proof_source: "hedra.com account $30/mo invoices" },
  { id: "wispr_flow", name: "Wispr Flow voice", status: "LIVE", problem: "App installée, voice→Warp/Chrome Erwin OK", next_action: "Garder LIVE, intégrer dans pipeline Codex parallel", owner_agent: "Kevin", proof_source: "Wispr.app dictation Warp Terminal" },
  { id: "atas", name: "ATAS order flow", status: "AWAITING_SETUP", problem: "Pas câblé sur signaux STRAT-17, pas de widget Hub footprint", next_action: "Connector MT5 + footprint cluster export hub widget", owner_agent: "Marco + Quant", proof_source: "ATAS desktop + MT5 plugin" },
  { id: "tradingview", name: "TradingView", status: "AWAITING_SETUP", problem: "Pas d'API publique, 0 chart annoté publié, 0 followers growth", next_action: "Script Playwright tradingview_screenshot.py + publish 3 ideas/sem M5 NQ", owner_agent: "Quant-TV", proof_source: "TradingView Pro + Playwright cron weekly" },
];

const TARGET_ARR_EUR = 100_000_000;
const TARGET_DATE = "2026-12-31";
const ASSET_FACTORY_CANON = {
  assets_count: 47,
  content_pieces: 35,
  brochures: 6,
  scripts: 6,
};
const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readNumber = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const readString = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const readJson = async (url: string): Promise<FetchResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const data = contentType.includes("application/json") ? JSON.parse(text) : { text };
    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? null : text.slice(0, 180),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      data: null,
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const readOpenClaw = async (path: string): Promise<FetchResult> => {
  if (!LOCAL_AUTH_TOKEN) {
    return {
      ok: false,
      status: null,
      data: null,
      error: "LOCAL_AUTH_TOKEN_NOT_AVAILABLE_TO_FRONTEND_ROUTE",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${OPENCLAW_API}/api/v1${path}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${LOCAL_AUTH_TOKEN}`,
      },
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      data: text ? JSON.parse(text) : null,
      error: response.ok ? null : text.slice(0, 180),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      data: null,
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const pageItems = (data: unknown): Record<string, unknown>[] => {
  if (Array.isArray(data)) return data.filter((item) => typeof item === "object") as Record<string, unknown>[];
  const record = toRecord(data);
  const items = record.items;
  return Array.isArray(items)
    ? (items.filter((item) => typeof item === "object") as Record<string, unknown>[])
    : [];
};

const readBool = (record: Record<string, unknown>, keys: string[]): boolean | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
};

const readStringArray = (record: Record<string, unknown>, keys: string[]): string[] => {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
};

const sanitizeTask = (task: Record<string, unknown>) => {
  const fields = toRecord(task.custom_field_values);

  return {
    id: readString(task, ["id"]) ?? "UNKNOWN",
    title: readString(task, ["title"]) ?? "UNKNOWN",
    status: readString(task, ["status"]) ?? "UNKNOWN",
    priority: readString(task, ["priority"]) ?? "UNKNOWN",
    boardId: readString(task, ["board_id"]),
    assignedAgentId: readString(task, ["assigned_agent_id"]),
    truckId: readString(fields, ["truck_id"]),
    truckName: readString(fields, ["truck_name"]),
    truckType: readString(fields, ["truck_type"]),
    truckStatus: readString(fields, ["truck_status"]) ?? "UNKNOWN",
    driverAgent: readString(fields, ["driver_agent"]) ?? "UNKNOWN",
    destinationBoard: readString(fields, ["destination_board"]) ?? "UNKNOWN",
    currentJob: readString(fields, ["current_job"]) ?? readString(task, ["title"]) ?? "UNKNOWN",
    route: readString(fields, ["route"]) ?? "UNKNOWN",
    payloadType: readString(fields, ["payload_type"]) ?? "UNKNOWN",
    sourceOfTruth: readString(fields, ["source_of_truth"]) ?? "UNKNOWN",
    lastRunAt: readString(fields, ["last_run_at"]),
    lastPayloadSummary: readString(fields, ["last_payload_summary"]) ?? "UNKNOWN",
    lastProof: readString(fields, ["last_proof"]) ?? "UNKNOWN",
    writeLock: readBool(fields, ["write_lock"]) ?? true,
    approvalGate: readString(fields, ["approval_gate"]) ?? "UNKNOWN",
    arrImpact: readString(fields, ["arr_impact"]) ?? "UNKNOWN",
    riskLevel: readString(fields, ["risk_level"]) ?? "UNKNOWN",
    nextAction: readString(fields, ["next_action"]) ?? "UNKNOWN",
    failureMode: readString(fields, ["failure_mode"]) ?? "",
    owner: readString(fields, ["owner"]) ?? readString(fields, ["driver_agent"]) ?? "UNKNOWN",
    proofRequired: readString(fields, ["proof_required"]) ?? "source_tag + proof",
    oldCityFlag: readBool(fields, ["old_city_flag"]) ?? false,
    dueTime: readString(fields, ["due_time", "due_within_7d"]) ?? readString(task, ["due_at", "due_date"]),
    sourceTag: readString(fields, ["source_tag"]) ?? readString(task, ["source_tag"]) ?? "OPENCLAW_TASK",
  };
};

const sanitizeOffer = (task: Record<string, unknown>, revenue: Record<string, unknown>) => {
  const fields = toRecord(task.custom_field_values);
  const offerId = readString(fields, ["offer_id"]);
  if (!offerId) return null;

  const hubPastDueCount = readNumber(revenue, ["past_due_count"]);
  const hubPastDueEur = readNumber(revenue, ["past_due_eur", "past_due_eur_total"]);
  const subsCount =
    offerId === "past_due_recovery"
      ? hubPastDueCount ?? readNumber(fields, ["subs_count"])
      : readNumber(fields, ["subs_count"]);
  const subsProof =
    offerId === "past_due_recovery" && hubPastDueCount !== null
      ? `Hub Iron read-only HTTP 200: past_due_count=${hubPastDueCount}, past_due_eur=${hubPastDueEur ?? "UNKNOWN"}.`
      : readString(fields, ["subs_count_last_proof"]) ?? "UNPROVED_THIS_PHASE";

  return {
    id: readString(task, ["id"]) ?? "UNKNOWN",
    taskTitle: readString(task, ["title"]) ?? "UNKNOWN",
    offerId,
    offerName: readString(fields, ["offer_name"]) ?? readString(task, ["title"]) ?? "UNKNOWN",
    priceEur: readNumber(fields, ["price_eur"]),
    priceLabel: readString(fields, ["price_label"]) ?? "UNKNOWN",
    billingPeriod: readString(fields, ["billing_period"]) ?? "UNKNOWN",
    stripeLink: readString(fields, ["stripe_link"]) ?? "UNKNOWN",
    stripeLinks: readStringArray(fields, ["stripe_links"]),
    statusCanon: readString(fields, ["status_canon"]) ?? "UNKNOWN",
    subsCount,
    subsCountLastProof: subsProof,
    publicUseBlockedAlias: readBool(fields, ["public_use_blocked_alias"]) ?? false,
    homeHouseCanon: readString(fields, ["home_house_canon"]) ?? "UNKNOWN",
    arrImpact: readString(fields, ["arr_impact"]) ?? "UNKNOWN",
    nextAction: readString(fields, ["next_action"]) ?? "UNKNOWN",
    sourceTag: "OFFER_FACTORY_PHASE6_STRIPE_READ_20260525",
    lastRunAt: readString(fields, ["last_run_at"]),
    lastProof: readString(fields, ["last_proof"]) ?? "UNKNOWN",
  };
};

const offerOrder = new Map(
  [
    "vip_standard",
    "academy",
    "premium_dashboard",
    "elite_1on1",
    "katikaan_paliers",
    "corsikaan_paliers",
    "setup_broker_help",
    "past_due_recovery",
  ].map((offerId, index) => [offerId, index]),
);

const knowledgeTruckConfig = [
  { id: "obsidian", truckName: "ObsidianTruck" },
  { id: "notion", truckName: "NotionOpsTruck" },
  { id: "drive", truckName: "DriveDocsTruck" },
] as const;

const sanitizeKnowledgeTruck = (
  id: (typeof knowledgeTruckConfig)[number]["id"],
  truckName: string,
  garageTasks: ReturnType<typeof sanitizeTask>[],
) => {
  const truck = garageTasks.find((task) => task.truckName === truckName);
  return {
    id,
    truckTaskId: truck?.id ?? "UNKNOWN",
    truckName,
    status: truck?.truckStatus ?? "UNKNOWN",
    lastProof: truck?.lastProof ?? "UNKNOWN",
    lastRunAt: truck?.lastRunAt ?? null,
    sourceTag: "KNOWLEDGE_TRUCKS_PHASE7_READONLY_20260525",
    sourceOfTruth: truck?.sourceOfTruth ?? "UNKNOWN",
    nextAction: truck?.nextAction ?? "UNKNOWN",
    proofRequired:
      truck?.proofRequired ?? "sanitized counts only; no PII; no note text; no external writes",
  };
};

type SanitizedTask = ReturnType<typeof sanitizeTask>;
type SanitizedOffer = NonNullable<ReturnType<typeof sanitizeOffer>>;
type KnowledgeSnapshot = ReturnType<typeof sanitizeKnowledgeTruck>;
type ProofLedgerSnapshot = {
  ok: boolean;
  status: string;
  sourceTag: string;
  proofsCount: number;
  proofGapsCount: number;
  latestProof: string | null;
  latestTitle: string | null;
};

const findTruck = (tasks: SanitizedTask[], truckNames: string[]) =>
  tasks.find((task) => task.truckName && truckNames.includes(task.truckName));

const parseNumberFromProof = (proof: string | undefined, pattern: RegExp): number | null => {
  const match = proof?.match(pattern);
  if (!match?.[1]) return null;
  const parsed = Number.parseFloat(match[1].replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const sumBrokerMetric = (brokers: Record<string, unknown>, key: string) =>
  Object.values(brokers).reduce<number>((total, broker) => {
    const value = readNumber(toRecord(broker), [key]);
    return total + (value ?? 0);
  }, 0);

const buildRouteAggregation = ({
  revenue,
  brokers,
  offers,
  garageTasks,
  knowledge,
  publisher,
  proofLedger,
}: {
  revenue: Record<string, unknown>;
  brokers: Record<string, unknown>;
  offers: SanitizedOffer[];
  garageTasks: SanitizedTask[];
  knowledge: Record<string, KnowledgeSnapshot>;
  publisher: Record<string, unknown>;
  proofLedger: ProofLedgerSnapshot;
}) => {
  const currentArr = readNumber(revenue, ["arr_eur"]);
  const currentMrr = readNumber(revenue, ["mrr_eur", "mrr_active_eur"]);
  const gapEur = currentArr === null ? null : TARGET_ARR_EUR - currentArr;
  const progressPct = currentArr === null ? null : (currentArr / TARGET_ARR_EUR) * 100;
  const remainingPct = progressPct === null ? null : Math.max(0, 100 - progressPct);
  const stripeTruck = findTruck(garageTasks, ["StripeTruck", "RevenueEndpointTruck"]);
  const brokerTruck = findTruck(garageTasks, ["BrokerReclaimTruck", "IronCRMTruck"]);
  const publisherTruck = findTruck(garageTasks, ["CofiaPublisherTruck"]);
  const gmailTruck = findTruck(garageTasks, ["GmailSupportTruck"]);
  const telegramTruck = findTruck(garageTasks, ["TelegramTruck", "TelegramVipTruck", "TelegramFreeTruck"]);
  const proofTruck = findTruck(garageTasks, ["ProofTruck"]);
  const proofTruckProof = proofTruck?.lastProof && proofTruck.lastProof !== "UNKNOWN" ? proofTruck.lastProof : null;
  const proofLedgerHasProof = proofLedger.ok && proofLedger.proofsCount > 0 && proofLedger.proofGapsCount === 0 && Boolean(proofLedger.latestProof);
  const complianceProof = proofTruckProof ?? proofLedger.latestProof;
  const complianceHasLiveProof = Boolean(proofTruckProof) || proofLedgerHasProof;
  const offersById = Object.fromEntries(
    offers.map((offer) => [offer.offerId, offer.subsCount]),
  );
  const brokerLifetime = readNumber(revenue, ["brokers_commission_lifetime_usd"])
    ?? sumBrokerMetric(brokers, "commission_lifetime_usd");
  const ftdCumul = readNumber(revenue, ["ftd_cumul"]) ?? sumBrokerMetric(brokers, "ftd");
  const obsidianFiles = parseNumberFromProof(knowledge.obsidian?.lastProof, /files=(\d+)/);
  const rendersOldCity = readNumber(publisher, ["output_dir_count", "renders_count", "count"]);

  return {
    revenue_route: {
      id: "revenue_route",
      label: "Revenue Route",
      source: "Stripe + Iron CRM + Brokers",
      current_arr_eur: currentArr,
      mrr_eur: currentMrr,
      active_subs_by_offer: offersById,
      target_arr_eur: TARGET_ARR_EUR,
      gap_eur: gapEur,
      gap_pct: remainingPct,
      status: "AMBER",
      key_metrics: {
        current_arr_eur: currentArr,
        mrr_eur: currentMrr,
        vip: readNumber(revenue, ["active_vip"]),
        past_due_eur: readNumber(revenue, ["past_due_eur", "past_due_eur_total"]),
      },
      last_proof: stripeTruck?.lastProof ?? "Hub Iron revenue summary read-only",
      next_checkpoint: stripeTruck?.nextAction ?? "Prepare past_due recovery draft, no send",
      gate_required: "STRIPE_WRITE locked; SEND locked",
      blockers: offers.some((offer) => offer.statusCanon === "NEEDS_CONFIRMATION")
        ? ["Academy offer NEEDS_CONFIRMATION", "Stripe by_offer counts AMBER"]
        : ["Stripe by_offer counts AMBER"],
    },
    acquisition_route: {
      id: "acquisition_route",
      label: "Acquisition Route",
      source: "Asset Factory + Acquisition Engine + CofiaPublisher",
      ...ASSET_FACTORY_CANON,
      renders_old_city: rendersOldCity,
      status: "AMBER",
      key_metrics: {
        assets_count: ASSET_FACTORY_CANON.assets_count,
        content_pieces: ASSET_FACTORY_CANON.content_pieces,
        brochures: ASSET_FACTORY_CANON.brochures,
        scripts: ASSET_FACTORY_CANON.scripts,
        renders_old_city: rendersOldCity,
      },
      last_proof: publisherTruck?.lastProof ?? "CofiaPublisher status read-only",
      next_checkpoint: publisherTruck?.nextAction ?? "Lock publish; certify read/status only",
      gate_required: "PUBLISH locked",
      blockers: ["86 renders remain OLD_CITY unless individually proven v22BU"],
    },
    knowledge_route: {
      id: "knowledge_route",
      label: "Knowledge Route",
      source: "Obsidian + Notion + Drive",
      obsidian_files: obsidianFiles,
      notion_status: knowledge.notion?.status ?? "UNKNOWN",
      drive_status: knowledge.drive?.status ?? "UNKNOWN",
      status: knowledge.obsidian?.status === "LIVE" ? "AMBER" : "UNKNOWN",
      key_metrics: {
        obsidian_files: obsidianFiles,
        notion_status: knowledge.notion?.status ?? "UNKNOWN",
        drive_status: knowledge.drive?.status ?? "UNKNOWN",
      },
      last_proof: knowledge.obsidian?.lastProof ?? "UNKNOWN",
      next_checkpoint: "Keep read-only probes; no note content or PII",
      gate_required: "READ only; no external writes",
      blockers: ["Notion read endpoint missing", "Drive file-level read unproved"],
    },
    broker_route: {
      id: "broker_route",
      label: "Broker Route",
      source: "FXcess + IronFX + Libertex + RaiseFX + TMGM",
      lifetime_usd: brokerLifetime,
      ftd_cumul: ftdCumul,
      status: "AMBER",
      key_metrics: {
        lifetime_usd: brokerLifetime,
        ftd_cumul: ftdCumul,
      },
      last_proof: brokerTruck?.lastProof ?? "Broker aggregate from Hub Iron summary",
      next_checkpoint: brokerTruck?.nextAction ?? "Close reclaim drafts, no send",
      gate_required: "SEND locked",
      blockers: ["Reclaim manager sends remain not executed"],
    },
    support_route: {
      id: "support_route",
      label: "Support Route",
      source: "Gmail + Telegram",
      unread: null,
      important: null,
      status: "AMBER",
      key_metrics: {
        unread: null,
        important: null,
        telegram_status: telegramTruck?.truckStatus ?? "UNKNOWN",
      },
      last_proof: gmailTruck?.lastProof ?? "Gmail counts not proved in snapshot",
      next_checkpoint: gmailTruck?.nextAction ?? "Read metadata counts only; no body, no send",
      gate_required: "SEND locked",
      blockers: ["Unread/important counts expected but not proved in current truck record"],
    },
    compliance_route: {
      id: "compliance_route",
      label: "Compliance Route",
      source: "Proof Ledger local + approval gates + write locks",
      publish_lock: true,
      send_lock: true,
      stripe_write_lock: true,
      status: complianceHasLiveProof ? "GREEN" : "AMBER",
      key_metrics: {
        publish_lock: true,
        send_lock: true,
        stripe_write_lock: true,
        proof_ledger_count: proofLedger.proofsCount,
        proof_gaps_count: proofLedger.proofGapsCount,
      },
      last_proof: complianceProof ?? "UNKNOWN",
      next_checkpoint: complianceHasLiveProof
        ? "Keep proof ledger blocking fake GREEN"
        : "Attach live Proof Ledger proof before GREEN",
      gate_required: "DIRECTOR_GO required for send/publish/deploy/Stripe write",
      blockers: complianceHasLiveProof
        ? []
        : proofLedger.proofGapsCount > 0
          ? [`Proof Ledger has ${proofLedger.proofGapsCount} proof gap(s)`]
          : ["Proof Ledger live proof missing in current snapshot"],
    },
  };
};

const buildInvestorRoom = ({
  revenue,
  routes,
  offers,
  allTasks,
}: {
  revenue: Record<string, unknown>;
  routes: ReturnType<typeof buildRouteAggregation>;
  offers: SanitizedOffer[];
  allTasks: SanitizedTask[];
}) => {
  const currentArr = readNumber(revenue, ["arr_eur"]);
  const currentMrr = readNumber(revenue, ["mrr_eur", "mrr_active_eur"]);
  const gapEur = currentArr === null ? null : TARGET_ARR_EUR - currentArr;
  const progressPct = currentArr === null ? null : (currentArr / TARGET_ARR_EUR) * 100;
  const remainingPct = progressPct === null ? null : Math.max(0, 100 - progressPct);
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const dueWithinSevenDays = allTasks.filter((task) => {
    if (!task.dueTime) return false;
    const dueTime = Date.parse(task.dueTime);
    if (!Number.isFinite(dueTime)) return false;
    return dueTime >= now && dueTime <= now + sevenDaysMs
      && (task.arrImpact === "direct" || task.priority === "high");
  });

  const topBlockers = [
    offers.some((offer) => offer.statusCanon === "NEEDS_CONFIRMATION")
      ? "Academy offer NEEDS_CONFIRMATION"
      : null,
    routes.knowledge_route.notion_status !== "LIVE"
      ? "Notion read endpoint missing"
      : null,
    routes.knowledge_route.drive_status !== "LIVE"
      ? "Drive file-level read unproved"
      : null,
    "Stripe by_offer counts remain AMBER",
    "Social publish remains locked until compliance gate + Director GO",
  ].filter(Boolean);

  return {
    current_arr_eur: currentArr,
    current_mrr_eur: currentMrr,
    target_arr_eur: TARGET_ARR_EUR,
    target_date: TARGET_DATE,
    gap_eur: gapEur,
    gap_pct: remainingPct,
    top_blockers: topBlockers,
    next_7_days_tasks: dueWithinSevenDays.slice(0, 10).map((task) => ({
      title: task.title,
      board_id: task.boardId,
      status: task.status,
      priority: task.priority,
      due_time: task.dueTime,
      arr_impact: task.arrImpact,
      source_tag: task.sourceTag,
      next_action: task.nextAction,
    })),
    last_proof_per_route: {
      revenue: routes.revenue_route.last_proof,
      acquisition: routes.acquisition_route.last_proof,
      knowledge: routes.knowledge_route.last_proof,
      broker: routes.broker_route.last_proof,
      support: routes.support_route.last_proof,
      compliance: routes.compliance_route.last_proof,
    },
  };
};

const REMOTION_OUT_DIR =
  process.env.COF_REMOTION_OUT_DIR ?? "/Users/burakokyay/cof-trading/remotion/out";
const CAPTIONS_DIR =
  process.env.COF_CAPTIONS_DIR ??
  "/Users/burakokyay/.openclaw/content/captions/2026-W22-premium-batch";
const ASSETS_INVENTORY_PATH =
  process.env.COF_ASSETS_INVENTORY_PATH ??
  "/Users/burakokyay/.openclaw/config/assets_inventory_canon.json";

async function readAssetsWarehouse() {
  const errors: string[] = [];
  let mp4Count: number | null = null;
  let captionsCount: number | null = null;
  let assetsInventoryCount: number | null = null;

  try {
    const files = await readdir(REMOTION_OUT_DIR);
    mp4Count = files.filter((file) => file.toLowerCase().endsWith(".mp4")).length;
  } catch (error) {
    errors.push(`mp4:${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const files = await readdir(CAPTIONS_DIR);
    captionsCount = files.filter((file) => !file.startsWith(".")).length;
  } catch (error) {
    errors.push(`captions:${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const raw = await readFile(ASSETS_INVENTORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.assets)) {
      assetsInventoryCount = parsed.assets.length;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.assets_count_actual === "number"
    ) {
      assetsInventoryCount = parsed.assets_count_actual;
    } else if (Array.isArray(parsed)) {
      assetsInventoryCount = parsed.length;
    } else {
      errors.push("assets_inventory:unsupported_json_shape");
    }
  } catch (error) {
    errors.push(`assets_inventory:${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    ok:
      typeof mp4Count === "number" &&
      typeof captionsCount === "number" &&
      typeof assetsInventoryCount === "number",
    sourceTag: "filesystem_assets_warehouse",
    mp4Count,
    captionsCount,
    assetsInventoryCount,
    paths: {
      remotionOutDir: REMOTION_OUT_DIR,
      captionsDir: CAPTIONS_DIR,
      assetsInventoryPath: ASSETS_INVENTORY_PATH,
    },
    errors,
  };
}

const AGENTS_CANON_PATH =
  process.env.COF_AGENTS_CANON_PATH ??
  "/Users/burakokyay/.openclaw/config/agents_visual_identity_canon.json";

async function readAgentsCanon() {
  try {
    const raw = await readFile(AGENTS_CANON_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.agents) ? (parsed.agents as Record<string, unknown>[]) : [];
    const agents = list.map((a) => ({
      no: typeof a.no === "number" ? a.no : null,
      id: String(a.id ?? "unknown"),
      name: String(a.name ?? "Unknown"),
      glyph: typeof a.glyph === "string" ? a.glyph : "",
      avatarEmoji: typeof a.avatar_emoji === "string" ? a.avatar_emoji : "",
      colorPrimary: typeof a.color_primary === "string" ? a.color_primary : "#888888",
      colorAccent: typeof a.color_accent === "string" ? a.color_accent : "#aaaaaa",
      roleBadge: typeof a.role_badge === "string" ? a.role_badge : "",
      house: typeof a.house_attached === "string" ? a.house_attached : "unassigned",
      houseColor: typeof a.house_color === "string" ? a.house_color : "#888888",
      rankLayer: typeof a.rank_layer === "string" ? a.rank_layer : "",
      boss: typeof a.boss === "string" ? a.boss : "",
      engine: typeof a.engine === "string" ? a.engine : "",
      responsibilities: Array.isArray(a.responsibilities)
        ? (a.responsibilities as unknown[]).filter((r): r is string => typeof r === "string")
        : [],
    }));
    return { ok: agents.length > 0, count: agents.length, sourceTag: "agents_visual_identity_canon", agents };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      sourceTag: "agents_visual_identity_canon",
      agents: [] as never[],
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

const OPENCLAW_JSON_PATH =
  process.env.COF_OPENCLAW_JSON_PATH ?? "/Users/burakokyay/.openclaw/openclaw.json";
const HEARTBEATS_DIR =
  process.env.COF_OPENCLAW_HEARTBEATS_DIR ?? "/Users/burakokyay/.openclaw/heartbeats";
const LOCAL_AGENT_TICK_INTERVAL_SEC = 900;
const LOBSTER_CONFIG_PATH =
  process.env.COF_LOBSTER_AGENTS_CONFIG_PATH ??
  "/Users/burakokyay/.openclaw/state/lobsterai_openclaw/cof_lobster_agents_360_config.json";
const LOBSTER_STATUS_PATH =
  process.env.COF_LOBSTER_STATUS_PATH ??
  "/Users/burakokyay/.openclaw/state/lobsterai_openclaw/cof_lobster_agents_status.json";
const LOBSTER_COMPANY_STATUS_PATH =
  process.env.COF_LOBSTER_COMPANY_STATUS_PATH ??
  "/Users/burakokyay/.openclaw/state/company_os/lobsterai_openclaw_status.json";
const TRUCKS_MANIFEST_PATH =
  process.env.COF_TRUCKS_MANIFEST_PATH ??
  "/Users/burakokyay/.openclaw/config/trucks_manifest.json";

const LOCAL_BOARD_HOUSE_MAP = [
  ["mission_control_tower", "Command Tower", ["mission_control_tower", "investor-accountability", "investor-room"]],
  ["youtube_studio", "COF IA Publisher", ["cofiapublisher-studio", "cofiapublisher", "social-distribution", "acquisition-engine"]],
  ["iron_office", "Revenue & CRM", ["revenue-command", "broker-reclaim", "support-recovery", "support-ops"]],
  ["vip_gate", "Telegram Community", ["vip_gate", "offer-factory"]],
  ["mt4_signal_tower", "Trading Tower", ["mt4_signal_tower"]],
  ["site_seo_lab", "Site & SEO Lab", ["product-new-york", "new-york-build", "release-gate", "site_seo_lab"]],
  ["openclaw_agent_barracks", "Agents Village", ["agentops-skills", "agentops", "garage-trucks", "toolchain"]],
  ["paperclip_factory", "Paperclip Factory", ["dispatch-queue", "paperclip_factory"]],
  ["lightrag_observatory", "LightRAG Observatory", ["lightrag_observatory"]],
  ["obsidian_library", "Knowledge Vault", ["obsidian_library", "notion-ops"]],
  ["calendar_tower", "Calendar Tower", ["calendar_tower"]],
  ["compliance_port", "Compliance Gate", ["compliance-gate", "compliance_port"]],
  ["central_brain", "Central Brain", ["central_brain", "proof-ledger", "cost-runway", "old-city-quarantine"]],
  ["trading_academy", "Trading Academy", ["trading_academy"]],
  ["assets_warehouse", "Publisher Suite", ["asset-factory", "content-factory", "assets_warehouse"]],
] as const;

const AGENT_HOUSE_OVERRIDES: Record<string, string> = {
  main: "openclaw_agent_barracks",
  jarod: "openclaw_agent_barracks",
  "cof-jarod": "openclaw_agent_barracks",
  "cof-mission-control-router": "openclaw_agent_barracks",
  router: "openclaw_agent_barracks",
  luffy: "central_brain",
  codex: "central_brain",
  kevin: "central_brain",
  oracle: "lightrag_observatory",
  guardian: "obsidian_library",
  steward: "paperclip_factory",
  sentinel: "openclaw_agent_barracks",
};

const readSafeJsonFile = async <T,>(filePath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
};

const parseTimestampMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(value.trim())) {
      return numeric > 10_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeAgentKey = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^cof-/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const heartbeatAliasesFor = (id: string, name: string) => {
  const aliases = new Set<string>();
  const normalizedId = normalizeAgentKey(id);
  const normalizedName = normalizeAgentKey(name);
  aliases.add(normalizedId);
  aliases.add(normalizedName);
  aliases.add(normalizedId.replace(/-/g, "_"));
  aliases.add(normalizedName.replace(/-/g, "_"));
  if (normalizedId === "main" || normalizedName.includes("jarod")) aliases.add("jarod");
  if (normalizedId === "brand-manager") aliases.add("brand_manager");
  if (normalizedId === "paul-mkt") aliases.add("paul_mkt");
  if (normalizedId === "paul-reseau") aliases.add("paul_reseau");
  return Array.from(aliases).filter(Boolean);
};

const runtimeMergeKeyFor = (id: string, name: string) => {
  const normalizedId = normalizeAgentKey(id);
  const normalizedName = normalizeAgentKey(name);
  if ((normalizedId === "main" || normalizedId === "jarod") && normalizedName.includes("jarod")) {
    return "jarod";
  }
  return normalizedId || normalizedName;
};

const readHeartbeat = async (aliases: string[], nowMs: number) => {
  const candidates = [];
  for (const alias of aliases) {
    const filePath = `${HEARTBEATS_DIR}/${alias}.json`;
    try {
      const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
      const tsMs =
        parseTimestampMs(raw.ts) ??
        parseTimestampMs(raw.timestamp) ??
        parseTimestampMs(raw.updated_at) ??
        parseTimestampMs(raw.last_tick_at);
      const ageSeconds = tsMs === null ? null : Math.max(0, Math.round((nowMs - tsMs) / 1000));
      const intervalSec = readNumber(raw, ["interval_sec"]);
      const scheduledIntervalSec = Math.max(intervalSec ?? 0, LOCAL_AGENT_TICK_INTERVAL_SEC);
      const aliveMaxSec = Math.max(180, Math.min(scheduledIntervalSec + 90, 1800));
      const rawStatus = String(raw.status ?? "UNKNOWN");
      const statusLower = rawStatus.toLowerCase();
      const fresh =
        ageSeconds !== null &&
        ageSeconds <= aliveMaxSec &&
        ["alive", "running", "live", "ok", "fresh"].some((token) => statusLower.includes(token));
      candidates.push({
        ok: true,
        path: filePath,
        rawStatus,
        ts: tsMs ? new Date(tsMs).toISOString() : null,
        ageSeconds,
        intervalSec,
        aliveMaxSec,
        fresh,
      });
    } catch {
      // Try next alias.
    }
  }
  if (candidates.length > 0) {
    candidates.sort((left, right) => {
      if (left.fresh !== right.fresh) return left.fresh ? -1 : 1;
      return (left.ageSeconds ?? Number.MAX_SAFE_INTEGER) - (right.ageSeconds ?? Number.MAX_SAFE_INTEGER);
    });
    return candidates[0];
  }
  return {
    ok: false,
    path: null,
    rawStatus: "NO_HEARTBEAT",
    ts: null,
    ageSeconds: null,
    fresh: false,
  };
};

const readLaunchctlText = async () => {
  try {
    // `launchctl print gui/<uid>` dumps inherited environment and can expose
    // local tokens. For Mission Control we only need labels, so use list +
    // plist names as the proof surface.
    const [listResult, plistNames] = await Promise.all([
      execFileAsync("launchctl", ["list"], {
        timeout: 1800,
        maxBuffer: 2_000_000,
      }),
      readdir("/Users/burakokyay/Library/LaunchAgents")
        .then((names) => names.filter((name) => name.endsWith(".plist")).map((name) => name.replace(/\.plist$/, "")).join("\n"))
        .catch(() => ""),
    ]);
    return `${listResult.stdout}\n${plistNames}`;
  } catch {
    try {
      const plistNames = await readdir("/Users/burakokyay/Library/LaunchAgents");
      return plistNames.filter((name) => name.endsWith(".plist")).map((name) => name.replace(/\.plist$/, "")).join("\n");
    } catch {
      return "";
    }
  }
};

const launchctlEnabled = (launchctlText: string, label: string | null) => {
  if (!label) return false;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}($|\\s)`).test(launchctlText);
};

const isOnDemandInventoryReady = async () => {
  const [inventoryJson, launchAgents] = await Promise.all([
    readSafeJsonFile<Record<string, unknown>>("/Users/burakokyay/.openclaw/state/INVENTORY/inventory.json", {}),
    readdir("/Users/burakokyay/Library/LaunchAgents").catch(() => [] as string[]),
  ]);
  const generatedMs = parseTimestampMs(readString(inventoryJson, ["generated_at_utc"]));
  const ageSeconds = generatedMs === null ? null : Math.max(0, Math.round((Date.now() - generatedMs) / 1000));
  const hasLaunchAgent = launchAgents.includes("com.coftrading.inventory-http-server.plist");
  return {
    ok: hasLaunchAgent && ageSeconds !== null && ageSeconds < 86_400,
    ageSeconds,
    proof: hasLaunchAgent
      ? `/Users/burakokyay/.openclaw/state/INVENTORY/inventory.json age=${ageSeconds ?? "UNKNOWN"}s; on-demand LaunchAgent present`
      : "inventory on-demand LaunchAgent missing",
  };
};
const localTickLabelFor = (id: string, name: string) => {
  const aliases = heartbeatAliasesFor(id, name);
  const preferred = aliases.includes("jarod") ? "jarod" : aliases[0];
  return preferred ? `com.coftrading.${preferred}-tick` : null;
};

const readTrucksManifest = async () => {
  const data = await readSafeJsonFile<Record<string, unknown>>(TRUCKS_MANIFEST_PATH, {});
  const trucks = Array.isArray(data.trucks) ? (data.trucks as Record<string, unknown>[]) : [];
  return {
    sourceTag: readString(data, ["source_tag"]) ?? "TRUCKS_MANIFEST_LOCAL",
    trucks,
  };
};

const buildLocalGarageTasks = (trucks: Record<string, unknown>[]) =>
  trucks.map((truck, index) => {
    const name = readString(truck, ["name", "truckName"]) ?? `LocalTruck${index + 1}`;
    const from = readString(truck, ["from"]) ?? "UNKNOWN";
    const to = readString(truck, ["to"]) ?? "UNKNOWN";
    const owner = readString(truck, ["owner"]) ?? "UNKNOWN";
    return {
      id: readString(truck, ["id"]) ?? `local-truck-${index + 1}`,
      title: name,
      status: "local",
      priority: "normal",
      boardId: null,
      assignedAgentId: null,
      truckId: readString(truck, ["id"]) ?? `T${index + 1}`,
      truckName: name,
      truckType: readString(truck, ["kind"]) ?? "local_manifest",
      truckStatus: "AMBER",
      driverAgent: owner,
      destinationBoard: to,
      currentJob: readString(truck, ["payload"]) ?? "Flux local manifeste",
      route: `${from} -> ${to}`,
      payloadType: readString(truck, ["kind"]) ?? "manifest",
      sourceOfTruth: readString(truck, ["source"]) ?? TRUCKS_MANIFEST_PATH,
      lastRunAt: null,
      lastPayloadSummary: readString(truck, ["payload"]) ?? "UNKNOWN",
      lastProof: `${TRUCKS_MANIFEST_PATH} · fallback local, gateway OpenClaw down`,
      writeLock: true,
      approvalGate: "READ_ONLY_FALLBACK",
      arrImpact: "indirect",
      riskLevel: "low",
      nextAction: "Rebrancher gateway OpenClaw pour passer de fallback local à runtime task",
      failureMode: "OPENCLAW_API_DOWN",
      owner,
      proofRequired: "gateway :18789 + task proof",
      oldCityFlag: false,
      dueTime: null,
      sourceTag: "OPENCLAW_LOCAL_TRUCKS_FALLBACK_V1_20260529",
    };
  });

const buildLocalBoards = () =>
  LOCAL_BOARD_HOUSE_MAP.flatMap(([houseId, name, slugs]) =>
    slugs.map((slug) => ({
      id: `local-${slug}`,
      name,
      slug,
      houseId,
    })),
  );

const readOpenClawRuntime = async () => {
  const nowMs = Date.now();
  const [openclawConfig, lobsterConfig, lobsterStatus, lobsterCompanyStatus, launchctlText] =
    await Promise.all([
      readSafeJsonFile<Record<string, unknown>>(OPENCLAW_JSON_PATH, {}),
      readSafeJsonFile<Record<string, unknown>>(LOBSTER_CONFIG_PATH, {}),
      readSafeJsonFile<Record<string, unknown>>(LOBSTER_STATUS_PATH, {}),
      readSafeJsonFile<Record<string, unknown>>(LOBSTER_COMPANY_STATUS_PATH, {}),
      readLaunchctlText(),
    ]);

  const visualCanon = await readSafeJsonFile<Record<string, unknown>>(AGENTS_CANON_PATH, {});
  const visualAgents = Array.isArray(visualCanon.agents)
    ? (visualCanon.agents as Record<string, unknown>[])
    : [];
  const houseByKey = new Map<string, string>();
  for (const agent of visualAgents) {
    const id = readString(agent, ["id"]);
    const name = readString(agent, ["name"]);
    const house = readString(agent, ["house_attached"]);
    if (house) {
      if (id) houseByKey.set(normalizeAgentKey(id), house);
      if (name) houseByKey.set(normalizeAgentKey(name), house);
    }
  }

  const openclawAgentsConfig = Array.isArray(toRecord(openclawConfig.agents).list)
    ? (toRecord(openclawConfig.agents).list as Record<string, unknown>[])
    : [];
  const lobsterAgentsConfig = Array.isArray(lobsterConfig.agents)
    ? (lobsterConfig.agents as Record<string, unknown>[])
    : [];

  const merged = new Map<string, Record<string, unknown>>();
  for (const agent of openclawAgentsConfig) {
    const id = readString(agent, ["id"]);
    const name = readString(agent, ["name"]) ?? id ?? "unknown";
    if (id) merged.set(runtimeMergeKeyFor(id, name), { ...agent, source: "openclaw.json" });
  }
  for (const agent of lobsterAgentsConfig) {
    const id = readString(agent, ["id"]);
    if (!id) continue;
    const name = readString(agent, ["name"]) ?? id;
    const key = runtimeMergeKeyFor(id, name);
    merged.set(key, { ...(merged.get(key) ?? {}), ...agent, source: "lobster_360_config" });
  }

  const rows = await Promise.all(
    Array.from(merged.entries()).map(async ([key, agent]) => {
      const id = readString(agent, ["id"]) ?? key;
      const name = readString(agent, ["name"]) ?? id;
      const aliases = heartbeatAliasesFor(id, name);
      const heartbeat = await readHeartbeat(aliases, nowMs);
      const tickLabel = localTickLabelFor(id, name);
      const tickEnabled = launchctlEnabled(launchctlText, tickLabel);
      const enabled = readBool(agent, ["enabled"]) ?? true;
      const primaryModel =
        readString(toRecord(agent.model), ["primary"]) ??
        readString(agent, ["model"]) ??
        "UNKNOWN";
      const team = readString(agent, ["team"]) ?? "openclaw";
      const homeHouse =
        AGENT_HOUSE_OVERRIDES[normalizeAgentKey(id)] ??
        AGENT_HOUSE_OVERRIDES[normalizeAgentKey(name)] ??
        houseByKey.get(normalizeAgentKey(id)) ??
        houseByKey.get(normalizeAgentKey(name)) ??
        (team.toLowerCase().includes("openclaw") ? "openclaw_agent_barracks" : "central_brain");
      const runtimeStatus = !enabled
        ? "DISABLED"
        : heartbeat.fresh
          ? "FRESH"
          : heartbeat.ok
            ? "STALE"
            : "NO_HEARTBEAT";
      return {
        id,
        name,
        team,
        enabled,
        homeHouse,
        primaryModel,
        heartbeat,
        tickLabel,
        tickEnabled,
        runtimeStatus,
        proof: heartbeat.ok
          ? `${heartbeat.path} age=${heartbeat.ageSeconds ?? "UNKNOWN"}s; launchctl=${tickEnabled ? "enabled" : "missing"}`
          : `no heartbeat in ${HEARTBEATS_DIR}; launchctl=${tickEnabled ? "enabled" : "missing"}`,
        nextAction: heartbeat.fresh
          ? "Surveiller, pas de relance nécessaire"
          : tickEnabled
            ? `kickstart ${tickLabel}`
            : `restaurer/charger ${tickLabel ?? "tick LaunchAgent"}`,
      };
    }),
  );

	  const serviceTargets: ReadonlyArray<{ id: string; label: string; url: string; onDemand?: boolean }> = [
	    { id: "openclaw_gateway_18789", label: "OpenClaw Gateway :18789", url: `${HOST}:18789/health` },
	    { id: "paperclip_3100", label: "Paperclip :3100", url: `${HOST}:3100/api/health` },
    { id: "inventory_8433", label: "Inventory :8433", url: `${HOST}:8433/health`, onDemand: true },
	    { id: "lightrag_9621", label: "LightRAG :9621", url: `${HOST}:9621/health` },
  ] as const;
  const services = await Promise.all(
    serviceTargets.map(async (svc) => {
      const result = await readJson(svc.url);
      const onDemandReady = svc.onDemand && !result.ok ? await isOnDemandInventoryReady() : null;
      return {
        id: svc.id,
        label: svc.label,
        url: svc.url,
        ok: result.ok || Boolean(onDemandReady?.ok),
        status:
          result.ok ? "LIVE" :
          onDemandReady?.ok ? "SLEEPING" :
          result.status === null ? "DOWN" :
          result.status === 404 ? "NOT_FOUND" :
          result.status === 401 ? "AUTH_REQUIRED" :
          "DEGRADED",
        http_code: result.status,
        proof: onDemandReady?.proof,
      };
    }),
  );

  const fresh = rows.filter((row) => row.runtimeStatus === "FRESH").length;
  const stale = rows.filter((row) => row.runtimeStatus === "STALE").length;
  const noHeartbeat = rows.filter((row) => row.runtimeStatus === "NO_HEARTBEAT").length;
  const disabled = rows.filter((row) => row.runtimeStatus === "DISABLED").length;
  const tickEnabled = rows.filter((row) => row.tickEnabled).length;
  const tickExpected = rows.filter((row) => Boolean(row.tickLabel)).length;
  const jarod = rows.find((row) => normalizeAgentKey(row.id) === "main" || normalizeAgentKey(row.name).includes("jarod"));
  const gatewayOk = services.some((svc) => svc.id === "openclaw_gateway_18789" && svc.ok);
  const servicesDown = services.filter((svc) => !svc.ok);
  const allRuntimeServicesOk = servicesDown.length === 0;
  const lobsterGeneratedAt = readString(lobsterStatus, ["generated_at_utc"]) ?? readString(lobsterConfig, ["generated_at_utc"]);
  const lobsterAgeSeconds = parseTimestampMs(lobsterGeneratedAt) === null
    ? null
    : Math.max(0, Math.round((nowMs - (parseTimestampMs(lobsterGeneratedAt) ?? nowMs)) / 1000));
  const lobsterConfigured = readNumber(lobsterStatus, ["agent_count"]) ??
    readNumber(lobsterConfig, ["agent_count"]) ??
    lobsterAgentsConfig.length;
  const lobsterEnabled = readNumber(lobsterStatus, ["enabled_agent_count"]) ??
    readNumber(lobsterConfig, ["enabled_agent_count"]) ??
    lobsterAgentsConfig.filter((agent) => readBool(agent, ["enabled"]) !== false).length;
  const lobsterCompanyStatusLabel = readString(lobsterCompanyStatus, ["status"]) ?? "UNKNOWN";

  const problems = [
    !gatewayOk
      ? {
          severity: "RED",
          title: "OpenClaw/Lobster gateway down",
          proof: "Probe :18789 non-OK dans snapshot",
          patch: "launchctl kickstart -k gui/$(id -u)/com.coftrading.openclaw-gateway ou relancer launcher Lobster OpenClaw",
        }
      : null,
    jarod && jarod.runtimeStatus !== "FRESH"
      ? {
          severity: "RED",
          title: "Jarod pas frais",
          proof: jarod.proof,
          patch: jarod.nextAction,
        }
      : null,
    stale > 0
      ? {
          severity: "AMBER",
          title: `${stale} agents stale`,
          proof: rows.filter((row) => row.runtimeStatus === "STALE").slice(0, 8).map((row) => row.name).join(", "),
          patch: "kickstart ciblé des LaunchAgents tick, pas relance massive",
        }
      : null,
    noHeartbeat > 0
      ? {
          severity: "AMBER",
          title: `${noHeartbeat} agents sans heartbeat`,
          proof: rows.filter((row) => row.runtimeStatus === "NO_HEARTBEAT").slice(0, 8).map((row) => row.name).join(", "),
          patch: "créer heartbeat/tick ou marquer dormant explicitement",
        }
      : null,
    servicesDown.length > 0
      ? {
          severity: "AMBER",
          title: `${servicesDown.length} runtime services down`,
          proof: servicesDown.map((svc) => `${svc.label}=${svc.status}`).join(", "),
          patch: "wake/kickstart ciblé du service concerné; ne pas marquer OpenClaw runtime GREEN",
        }
      : null,
    lobsterAgeSeconds !== null && lobsterAgeSeconds > 86_400
      ? {
          severity: "AMBER",
          title: "Lobster 360 status stale",
          proof: `${LOBSTER_STATUS_PATH} generated_at=${lobsterGeneratedAt}`,
          patch: "relancer probe/config sync Lobster 360 après gateway",
        }
      : null,
  ].filter(Boolean);

  return {
    sourceTag: "OPENCLAW_LOBSTER_MISSION_CONTROL_RUNTIME_V1_20260529",
    sourcePaths: {
      openclawJson: OPENCLAW_JSON_PATH,
      lobsterConfig: LOBSTER_CONFIG_PATH,
      lobsterStatus: LOBSTER_STATUS_PATH,
      lobsterCompanyStatus: LOBSTER_COMPANY_STATUS_PATH,
      heartbeatsDir: HEARTBEATS_DIR,
    },
    status: gatewayOk && allRuntimeServicesOk && jarod?.runtimeStatus === "FRESH" && fresh >= 5 ? "LIVE" : fresh > 0 ? "AMBER" : "QUARANTINE",
    lobsterCompanyStatus: lobsterCompanyStatusLabel,
    counts: {
      total: rows.length,
      fresh,
      stale,
      noHeartbeat,
      disabled,
      tickEnabled,
      tickExpected,
      servicesOk: services.filter((svc) => svc.ok).length,
      servicesTotal: services.length,
      lobsterConfigured,
      lobsterEnabled,
    },
    jarod: jarod ?? null,
    services,
    agents: rows.sort((a, b) => {
      const order = { FRESH: 0, STALE: 1, NO_HEARTBEAT: 2, DISABLED: 3 } as Record<string, number>;
      return (order[a.runtimeStatus] ?? 9) - (order[b.runtimeStatus] ?? 9) || a.name.localeCompare(b.name);
    }),
    problems,
  };
};

export async function GET() {
  const [
    revenueResult,
    housesResult,
    publisherResult,
	    ackResult,
	    rtkResult,
	    proofLedgerResult,
	    boardsResult,
	    agentsResult,
	    fieldsResult,
    openclawRuntime,
    trucksManifest,
  ] =
    await Promise.all([
      readLocalRevenue(),
      readJson(endpoints.houses),
      readJson(endpoints.publisher),
	      readJson(endpoints.ack),
	      readJson(endpoints.rtk),
	      readJson(endpoints.proofLedger),
	      readOpenClaw("/boards"),
	      readOpenClaw("/agents"),
	      readOpenClaw("/organizations/me/custom-fields"),
      readOpenClawRuntime(),
      readTrucksManifest(),
    ]);

	  const revenue = toRecord(revenueResult.data);
	  const housesPayload = toRecord(housesResult.data);
	  const publisher = toRecord(publisherResult.data);
	  const proofLedgerPayload = toRecord(proofLedgerResult.data);
	  const proofLedgerProofs = Array.isArray(proofLedgerPayload.proofs)
	    ? proofLedgerPayload.proofs.filter((item) => item && typeof item === "object") as Record<string, unknown>[]
	    : [];
	  const proofLedgerGaps = Array.isArray(proofLedgerPayload.proof_gaps)
	    ? proofLedgerPayload.proof_gaps
	    : [];
	  const latestProof = proofLedgerProofs[0] ? toRecord(proofLedgerProofs[0]) : {};
	  const proofLedger: ProofLedgerSnapshot = {
	    ok: proofLedgerResult.ok && proofLedgerProofs.length > 0 && proofLedgerGaps.length === 0,
	    status: readString(proofLedgerPayload, ["status"]) ?? (proofLedgerResult.ok ? "UNKNOWN" : "SOURCE_DOWN"),
	    sourceTag: readString(proofLedgerPayload, ["source_tag"]) ?? "LOCAL_MISSION_CONTROL_PROOF_LEDGER",
	    proofsCount: proofLedgerProofs.length,
	    proofGapsCount: proofLedgerGaps.length,
	    latestProof: readString(latestProof, ["path", "proof", "source"]) ?? null,
	    latestTitle: readString(latestProof, ["title", "label", "kind"]) ?? null,
	  };

  const houses = Array.isArray(housesPayload.houses) ? housesPayload.houses : [];
  const brokers = toRecord(revenue.brokers);
  const apiBoards = pageItems(boardsResult.data);
  const boards = apiBoards.length > 0 ? apiBoards : buildLocalBoards();
  const apiAgents = pageItems(agentsResult.data);
  const agents = apiAgents.length > 0
    ? apiAgents
    : openclawRuntime.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.runtimeStatus === "FRESH" ? "fresh" : agent.runtimeStatus.toLowerCase(),
        board_id: `local-${agent.homeHouse}`,
        identity_profile: {
          role: agent.team,
          authorized_trucks: "READ_ONLY_LOCAL_FALLBACK",
          daily_output: agent.runtimeStatus,
          forbidden_actions: "send,publish,deploy,stripe_write",
        },
      }));
  const customFields = pageItems(fieldsResult.data);
  const garageBoard = apiBoards.find((board) => readString(board, ["slug"]) === "garage-trucks");
  const garageBoardId = garageBoard ? readString(garageBoard, ["id"]) : null;
  const offerBoard = apiBoards.find((board) => readString(board, ["slug"]) === "offer-factory");
  const offerBoardId = offerBoard ? readString(offerBoard, ["id"]) : null;
  const proofBoard = apiBoards.find((board) => readString(board, ["slug"]) === "proof-ledger");
  const boardTaskResults = await Promise.all(
    apiBoards.slice(0, 60).map(async (board) => {
      const boardId = readString(board, ["id"]);
      if (!boardId) return { board, result: { ok: false, status: null, data: null, error: "MISSING_BOARD_ID" } as FetchResult };
      return {
        board,
        result: await readOpenClaw(`/boards/${boardId}/tasks`),
      };
    }),
  );
  const garageTasksResult = garageBoardId
    ? await readOpenClaw(`/boards/${garageBoardId}/tasks`)
    : {
        ok: false,
        status: null,
        data: null,
        error: "GARAGE_TRUCKS_BOARD_NOT_FOUND",
      };
  const apiGarageTasks = pageItems(garageTasksResult.data).map(sanitizeTask);
  const localGarageTasks = buildLocalGarageTasks(trucksManifest.trucks);
  const garageTasks = apiGarageTasks.length > 0 ? apiGarageTasks : localGarageTasks;
  const knowledge = Object.fromEntries(
    knowledgeTruckConfig.map((config) => [
      config.id,
      sanitizeKnowledgeTruck(config.id, config.truckName, garageTasks),
    ]),
  );
  const offerTasksResult = offerBoardId
    ? await readOpenClaw(`/boards/${offerBoardId}/tasks`)
    : {
        ok: false,
        status: null,
        data: null,
        error: "OFFER_FACTORY_BOARD_NOT_FOUND",
      };
  const offers = pageItems(offerTasksResult.data)
    .map((task) => sanitizeOffer(task, revenue))
    .filter(Boolean)
    .sort((left, right) => {
      const leftOrder = offerOrder.get(left?.offerId ?? "") ?? 999;
      const rightOrder = offerOrder.get(right?.offerId ?? "") ?? 999;
      return leftOrder - rightOrder;
    });
  const hasOpenClaw = boardsResult.ok && Boolean(garageBoardId) && garageTasksResult.ok;
  const proofApprovals = proofBoard
    ? pageItems((await readOpenClaw(`/boards/${readString(proofBoard, ["id"])}/approvals`)).data)
    : [];
  const boardTaskPayloads = boardTaskResults.map(({ board, result }) => ({
    board,
    result,
    tasks: pageItems(result.data).map(sanitizeTask),
  }));
  const allBoardTasks = boardTaskPayloads.flatMap(({ tasks }) => tasks);
  const buildingSummaries = boardTaskPayloads.map(({ board, result, tasks }) => {
    const truckNames = Array.from(new Set(tasks.map((task) => task.truckName).filter(Boolean)));
    return {
      id: readString(board, ["id"]) ?? "UNKNOWN",
      name: readString(board, ["name"]) ?? "UNKNOWN",
      slug: readString(board, ["slug"]) ?? "UNKNOWN",
      activeTasks: tasks.filter((task) => task.status !== "done").length,
      trucks: truckNames.slice(0, 8),
      proof: tasks.some((task) => task.lastProof && task.lastProof !== "UNKNOWN")
        ? "TASK_PROOF_FIELDS"
        : result.ok
          ? "TASKS_READ_NO_PROOF_YET"
          : "UNKNOWN",
      arrImpact: tasks.some((task) => task.arrImpact === "direct") ? "direct" : "indirect",
    };
  });
  // Revenue unifiée : aucune constante Stripe figée. readLocalRevenue applique
  // l'overlay backend NY :8000 quand il répond; sinon fallback cof_state local.
  const unifiedRevenue = {
    ...revenue,
    past_due_eur_total: readNumber(revenue, ["past_due_eur_total", "past_due_eur"]),
    past_due_source: readString(revenue, ["source_tag"]) ?? "NY local revenue snapshot",
  };
  const revenueDriftDetected = false;

  const routes = buildRouteAggregation({
    revenue: unifiedRevenue,
    brokers,
	    offers: offers as SanitizedOffer[],
	    garageTasks,
	    knowledge,
	    publisher,
	    proofLedger,
	  });
  const investorRoom = buildInvestorRoom({
    revenue: unifiedRevenue,
    routes,
    offers: offers as SanitizedOffer[],
    allTasks: allBoardTasks,
  });

  // P11 Sourate LXVIII Al-Muharrik · Services LIVE probes parallel (8 services canon Hub Vivant)
  const serviceProbes = await Promise.all(
    SERVICE_PROBES.map(async (svc) => {
      const result = await readJson(svc.url);
      const onDemandReady = svc.onDemand && !result.ok ? await isOnDemandInventoryReady() : null;
      const status: string =
        result.ok ? "LIVE" :
        onDemandReady?.ok ? "SLEEPING" :
        result.status === 307 || result.status === 302 ? "REDIRECT" :
        result.status === 401 ? "AUTH_REQUIRED" :
        result.status === 404 ? "NOT_FOUND" :
        result.status === null ? "DOWN" :
        "DEGRADED";
      return {
        id: svc.id,
        label: svc.label,
        url: svc.url,
        role: svc.role,
        http_code: result.status,
        ok: result.ok || Boolean(onDemandReady?.ok),
        status,
        proof: onDemandReady?.proof,
      };
    }),
  );

  // P11 Sourate LVI · Agents fresh/stale depuis OpenClaw backend, fallback local heartbeats si gateway down.
  const freshAgentsList = apiAgents.length > 0 ? agents.filter((a) => {
    const st = readString(toRecord(a), ["status"]);
    return st === "active" || st === "fresh" || st === "online";
  }) : [];
  const staleAgentsList = apiAgents.length > 0 ? agents.filter((a) => {
    const st = readString(toRecord(a), ["status"]);
    return st !== "active" && st !== "fresh" && st !== "online";
  }) : [];
  const agentsBlock = apiAgents.length > 0
    ? {
        total: agents.length,
        fresh: freshAgentsList.length,
        stale: staleAgentsList.length,
        fresh_names: freshAgentsList
          .map((a) => readString(toRecord(a), ["name"]))
          .filter((n): n is string => !!n)
          .slice(0, 15),
        stale_names_top: staleAgentsList
          .map((a) => readString(toRecord(a), ["name"]))
          .filter((n): n is string => !!n)
          .slice(0, 15),
        freshness_ratio: agents.length > 0 ? freshAgentsList.length / agents.length : 0,
      }
    : {
        total: openclawRuntime.counts.total,
        fresh: openclawRuntime.counts.fresh,
        stale: openclawRuntime.counts.stale + openclawRuntime.counts.noHeartbeat,
        fresh_names: openclawRuntime.agents
          .filter((agent) => agent.runtimeStatus === "FRESH")
          .map((agent) => agent.name)
          .slice(0, 15),
        stale_names_top: openclawRuntime.agents
          .filter((agent) => agent.runtimeStatus !== "FRESH")
          .map((agent) => agent.name)
          .slice(0, 15),
        freshness_ratio: openclawRuntime.counts.total > 0
          ? openclawRuntime.counts.fresh / openclawRuntime.counts.total
          : 0,
      };

  // P11 Sourate LXVI Tatbīq · 7 actions concrètes Muharrik gates (fallback si filtre vide)
  const fallbackNext7Days = [
    { title: "YouTube OAuth refresh + publish video-01 unlisted", board_id: null, status: "pending", priority: "urgent", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_YOUTUBE_UPLOAD", next_action: "Erwin OAuth Google Cloud Console 2min puis Studio upload + Reviewer GREEN → public" },
    { title: "Instagram premier post brand W22 + bio + 3 stories", board_id: null, status: "pending", priority: "urgent", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_INSTAGRAM_POST", next_action: "Meta Graph API ig_user_id link Page + caption W22 + brand-kit assets" },
    { title: "Facebook Page cover + profile + about + post + Verified", board_id: null, status: "pending", priority: "urgent", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_META_WRITE", next_action: "Upload via Graph API page_token + facebook-page-cover.png 1MB" },
    { title: "Past_due 291€ recovery (Jérôme + Albina + Jérémy)", board_id: null, status: "pending", priority: "urgent", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_STRIPE_PAST_DUE", next_action: "Customer Portal session URL + DM peer_context Iron CRM tg_id" },
    { title: "WhatsApp Business send 3 brokers reclaim", board_id: null, status: "pending", priority: "urgent", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_WHATSAPP_BROKERS", next_action: "Wait template approval Meta + dispatch_whatsapp_meta.py --cadence daily live" },
    { title: "Notion sync cron Hub↔orders canon + Welcome VIP template", board_id: null, status: "pending", priority: "high", due_time: null, arr_impact: "indirect", source_tag: "MUHARRIK_GATE_NOTION_SYNC", next_action: "Script notion_to_orders.py LaunchAgent 1h" },
    { title: "CofiaPublisher LaunchAgent ferrari-refresh + drawer Hub UI", board_id: null, status: "pending", priority: "high", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_PUBLISHER_DRAWER", next_action: "Install LA 300s + drawer cof-island-v21.html L7139+L13018" },
  ];
  const investorRoomEnriched = {
    ...investorRoom,
    next_7_days_tasks: investorRoom.next_7_days_tasks.length > 0 ? investorRoom.next_7_days_tasks : fallbackNext7Days,
  };

  const assetsWarehouse = await readAssetsWarehouse();
  const agentsCanon = await readAgentsCanon();

  return NextResponse.json(
    {
      ok: revenueResult.ok || housesResult.ok || publisherResult.ok,
      fetchedAt: new Date().toISOString(),
      sourceTag: "COFIATRADING_WORLD_CONTROL_READ_ONLY_SNAPSHOT_20260525",
      assetsWarehouse,
      agentsCanon,
      endpoints: {
        revenue: { ok: revenueResult.ok, status: revenueResult.status },
        houses: { ok: housesResult.ok, status: housesResult.status },
        publisher: { ok: publisherResult.ok, status: publisherResult.status },
	        ack: { ok: ackResult.ok, status: ackResult.status },
	        rtk: { ok: rtkResult.ok, status: rtkResult.status },
	        proofLedger: { ok: proofLedgerResult.ok, status: proofLedgerResult.status },
	        openclawBoards: { ok: boardsResult.ok, status: boardsResult.status },
        openclawAgents: { ok: agentsResult.ok, status: agentsResult.status },
        openclawCustomFields: { ok: fieldsResult.ok, status: fieldsResult.status },
        openclawGarageTrucks: { ok: garageTasksResult.ok, status: garageTasksResult.status },
        openclawOffers: { ok: offerTasksResult.ok, status: offerTasksResult.status },
      },
      has_openclaw: hasOpenClaw,
      hasOpenClaw,
      garageTrucks: garageTasks,
	      knowledge,
	      proofLedger,
	      offers,
      routes,
      investor_room: investorRoomEnriched,
      agents: agentsBlock,
      openclawRuntime,
      commerce_machine: COMMERCE_MACHINE_CANON,
      revenue: {
        sourceTag: readString(unifiedRevenue, ["source_tag"]),
        currentMrrEur: readNumber(unifiedRevenue, ["mrr_eur", "mrr_active_eur"]),
        currentArrEur: readNumber(unifiedRevenue, ["arr_eur"]),
        activeVip: readNumber(unifiedRevenue, ["active_vip"]),
        pastDueCount: readNumber(unifiedRevenue, ["past_due_count"]),
        pastDueEur: readNumber(unifiedRevenue, ["past_due_eur", "past_due_eur_total"]),
        past_due_source: readString(unifiedRevenue, ["past_due_source"]),
        revenue_drift_detected: revenueDriftDetected,
        ftdCumul: readNumber(unifiedRevenue, ["ftd_cumul"]),
        brokersLifetimeUsd: readNumber(unifiedRevenue, ["brokers_commission_lifetime_usd"]),
        clientsActive: readNumber(unifiedRevenue, ["clients_active"]),
        brokers: {
          fxcess: toRecord(brokers.fxcess),
          ironfx: toRecord(brokers.ironfx),
          libertex: toRecord(brokers.libertex),
          raisefx: toRecord(brokers.raisefx),
        },
      },
      centralBrain: {
        housesCount: readNumber(housesPayload, ["houses_count", "count"]) ?? houses.length,
        houses: houses.slice(0, 20).map((house) => {
          const entry = toRecord(house);
          return {
            key: readString(entry, ["key", "id", "name"]) ?? "UNKNOWN",
            title: readString(entry, ["title", "label", "name"]) ?? "UNKNOWN",
            status: readString(entry, ["status"]) ?? "UNKNOWN",
          };
        }),
      },
      publisher: {
        ok: publisherResult.ok,
        status: readString(publisher, ["status"]) ?? (publisherResult.ok ? "LIVE_HTTP" : "UNKNOWN"),
        service: readString(publisher, ["service"]) ?? "CofiaPublisher",
        outputDirCount: readNumber(publisher, ["output_dir_count", "renders_count", "count"]),
      },
      services: serviceProbes,
      openclaw: {
        sourceTag: "COFIATRADING_WORLD_CONTROL_LIVING_OBJECTS_20260525",
        boards: boards.map((board) => ({
          id: readString(board, ["id"]) ?? "UNKNOWN",
          name: readString(board, ["name"]) ?? "UNKNOWN",
          slug: readString(board, ["slug"]) ?? "UNKNOWN",
        })),
        agents: agents.map((agent) => {
          const profile = toRecord(agent.identity_profile);
          return {
            id: readString(agent, ["id"]) ?? "UNKNOWN",
            name: readString(agent, ["name"]) ?? "UNKNOWN",
            status: readString(agent, ["status"]) ?? "UNKNOWN",
            boardId: readString(agent, ["board_id"]),
            role: readString(profile, ["role"]) ?? "UNKNOWN",
            authorizedTrucks: readString(profile, ["authorized_trucks"]) ?? "UNKNOWN",
            dailyOutput: readString(profile, ["daily_output"]) ?? "UNKNOWN",
            forbiddenActions: readString(profile, ["forbidden_actions"]) ?? "UNKNOWN",
          };
        }),
        customFields: customFields.map((field) => ({
          key: readString(field, ["field_key"]) ?? "UNKNOWN",
          label: readString(field, ["label"]) ?? "UNKNOWN",
          type: readString(field, ["field_type"]) ?? "UNKNOWN",
        })),
        garageTrucks: garageTasks,
        approvals: proofApprovals.map((approval) => ({
          id: readString(approval, ["id"]) ?? "UNKNOWN",
          actionType: readString(approval, ["action_type"]) ?? "UNKNOWN",
          status: readString(approval, ["status"]) ?? "UNKNOWN",
          taskTitles: Array.isArray(approval.task_titles) ? approval.task_titles : [],
        })),
        buildings: buildingSummaries,
      },
      writeBlocked: true,
      piiBlocked: true,
      dangerousActions: ["SEND", "PUBLISH", "DEPLOY", "STRIPE_WRITE", "OLD_CITY_PATCH", "MAIN_MERGE"],
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
