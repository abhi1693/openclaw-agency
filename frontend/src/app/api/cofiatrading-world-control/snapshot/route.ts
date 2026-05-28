import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FetchResult = {
  ok: boolean;
  status: number | null;
  data: unknown;
  error: string | null;
};

const HOST = process.env.COF_HOST ?? "http://host.docker.internal";
const OPENCLAW_API =
  process.env.OPENCLAW_BACKEND_INTERNAL_URL ?? "http://backend:8000";
const LOCAL_AUTH_TOKEN = process.env.LOCAL_AUTH_TOKEN;

const endpoints = {
  revenue: process.env.COF_REVENUE_SUMMARY_URL ?? `${HOST}:8430/api/iron/revenue/summary`,
  houses: process.env.COF_CENTRAL_BRAIN_HOUSES_URL ?? `${HOST}:8767/api/central-brain/houses`,
  publisher: process.env.COF_PUBLISHER_STATUS_URL ?? `${HOST}:8540/api/status`,
  ack: process.env.COF_ACK_HEALTH_URL ?? `${HOST}:8443/health`,
  rtk: process.env.COF_RTK_HEALTH_URL ?? `${HOST}:11435/health`,
};

// P11 Sourate LXVIII Al-Muharrik · 8 services canon probes LIVE (cockpit Hub Vivant)
const SERVICE_PROBES: ReadonlyArray<{ id: string; label: string; url: string; role: string }> = [
  { id: "hub_8430", label: "Hub :8430", url: `${HOST}:8430/cofiacontrol.html`, role: "Hub principal Iron + revenue + chat" },
  { id: "mission_control_3000", label: "Mission Control :3000", url: `${HOST}:3000/cofiatrading-world-control`, role: "Cockpit Hub Vivant NY" },
  { id: "central_brain_8767", label: "Central Brain :8767", url: `${HOST}:8767/api/central-brain/houses`, role: "Registry 15 maisons SSOT" },
  { id: "cofiapublisher_8540", label: "CofiaPublisher :8540", url: `${HOST}:8540/api/status`, role: "Pipeline vidéos 89 MP4" },
  { id: "inventory_8433", label: "Inventory :8433", url: `${HOST}:8433/`, role: "Living Inventory canon" },
  { id: "llm_proxy_11435", label: "rtk-llm-proxy :11435", url: `${HOST}:11435`, role: "Gemini/Qwen routing local" },
  { id: "lightrag_9621", label: "LightRAG :9621", url: `${HOST}:9621/api/health`, role: "Semantic graph recall" },
  { id: "paperclip_3100", label: "Paperclip :3100", url: `${HOST}:3100`, role: "Universal assets pipeline" },
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
  { id: "stripe", name: "Stripe", status: "LIVE", problem: "MRR 879€ / 7 VIP / 3 past_due 291€ (Jérôme + Albina + Jérémy), past_due retry Iron daemon bloqué 33 instances depuis 22/05", next_action: "Past_due retry via Customer Portal session URL + DM peer_context Iron daemon fix", owner_agent: "Mikā'īl", proof_source: "Stripe MCP search status=past_due → 3 subs LIVE 2026-05-27T16:11Z" },
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
const STRIPE_DIRECT_PAST_DUE = {
  eur: 291,
  count: 3,
  source: "Stripe MCP direct — Hub drift detected",
} as const;

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
}: {
  revenue: Record<string, unknown>;
  brokers: Record<string, unknown>;
  offers: SanitizedOffer[];
  garageTasks: SanitizedTask[];
  knowledge: Record<string, KnowledgeSnapshot>;
  publisher: Record<string, unknown>;
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
      source: "Proof Ledger + approval gates + write locks",
      publish_lock: true,
      send_lock: true,
      stripe_write_lock: true,
      status: "GREEN",
      key_metrics: {
        publish_lock: true,
        send_lock: true,
        stripe_write_lock: true,
      },
      last_proof: proofTruck?.lastProof ?? "Dangerous actions locked in World Control",
      next_checkpoint: "Keep proof ledger blocking fake GREEN",
      gate_required: "DIRECTOR_GO required for send/publish/deploy/Stripe write",
      blockers: [],
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

export async function GET() {
  const [revenueResult, housesResult, publisherResult, ackResult, rtkResult, boardsResult, agentsResult, fieldsResult] =
    await Promise.all([
      readJson(endpoints.revenue),
      readJson(endpoints.houses),
      readJson(endpoints.publisher),
      readJson(endpoints.ack),
      readJson(endpoints.rtk),
      readOpenClaw("/boards"),
      readOpenClaw("/agents"),
      readOpenClaw("/organizations/me/custom-fields"),
    ]);

  const revenue = toRecord(revenueResult.data);
  const housesPayload = toRecord(housesResult.data);
  const publisher = toRecord(publisherResult.data);

  const houses = Array.isArray(housesPayload.houses) ? housesPayload.houses : [];
  const brokers = toRecord(revenue.brokers);
  const boards = pageItems(boardsResult.data);
  const agents = pageItems(agentsResult.data);
  const customFields = pageItems(fieldsResult.data);
  const garageBoard = boards.find((board) => readString(board, ["slug"]) === "garage-trucks");
  const garageBoardId = garageBoard ? readString(garageBoard, ["id"]) : null;
  const offerBoard = boards.find((board) => readString(board, ["slug"]) === "offer-factory");
  const offerBoardId = offerBoard ? readString(offerBoard, ["id"]) : null;
  const proofBoard = boards.find((board) => readString(board, ["slug"]) === "proof-ledger");
  const boardTaskResults = await Promise.all(
    boards.slice(0, 60).map(async (board) => {
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
  const garageTasks = pageItems(garageTasksResult.data).map(sanitizeTask);
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
  // P11 Sourate LXVIII · Revenue drift detection (Hub past_due vs Stripe MCP real)
  const hubPastDueEur = readNumber(revenue, ["past_due_eur", "past_due_eur_total"]);
  const hubPastDueCount = readNumber(revenue, ["past_due_count"]);
  const revenueDriftDetected =
    hubPastDueEur !== STRIPE_DIRECT_PAST_DUE.eur ||
    hubPastDueCount !== STRIPE_DIRECT_PAST_DUE.count;
  const unifiedRevenue = {
    ...revenue,
    past_due_eur: STRIPE_DIRECT_PAST_DUE.eur,
    past_due_eur_total: STRIPE_DIRECT_PAST_DUE.eur,
    past_due_count: STRIPE_DIRECT_PAST_DUE.count,
    past_due_source: revenueDriftDetected
      ? STRIPE_DIRECT_PAST_DUE.source
      : readString(revenue, ["source_tag"]) ?? "Hub Iron revenue summary",
  };

  const routes = buildRouteAggregation({
    revenue: unifiedRevenue,
    brokers,
    offers: offers as SanitizedOffer[],
    garageTasks,
    knowledge,
    publisher,
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
      const status: string =
        result.ok ? "LIVE" :
        result.status === 307 || result.status === 302 ? "REDIRECT" :
        result.status === 401 ? "AUTH_REQUIRED" :
        result.status === 404 ? "NOT_FOUND" :
        result.status === null ? "DOWN" :
        "DEGRADED";
      return { id: svc.id, label: svc.label, url: svc.url, role: svc.role, http_code: result.status, ok: result.ok, status };
    }),
  );

  // P11 Sourate LVI · Agents fresh/stale depuis OpenClaw backend status field
  const freshAgentsList = agents.filter((a) => {
    const st = readString(toRecord(a), ["status"]);
    return st === "active" || st === "fresh" || st === "online";
  });
  const staleAgentsList = agents.filter((a) => {
    const st = readString(toRecord(a), ["status"]);
    return st !== "active" && st !== "fresh" && st !== "online";
  });
  const agentsBlock = {
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

  return NextResponse.json(
    {
      ok: revenueResult.ok || housesResult.ok || publisherResult.ok,
      fetchedAt: new Date().toISOString(),
      sourceTag: "COFIATRADING_WORLD_CONTROL_READ_ONLY_SNAPSHOT_20260525",
      endpoints: {
        revenue: { ok: revenueResult.ok, status: revenueResult.status },
        houses: { ok: housesResult.ok, status: housesResult.status },
        publisher: { ok: publisherResult.ok, status: publisherResult.status },
        ack: { ok: ackResult.ok, status: ackResult.status },
        rtk: { ok: rtkResult.ok, status: rtkResult.status },
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
      offers,
      routes,
      investor_room: investorRoomEnriched,
      agents: agentsBlock,
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
