import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import { execFile } from "child_process";
import { basename, extname, join } from "path";
import { promisify } from "util";

import { readLocalRevenue } from "../_lib/localRevenue";
import { buildHubWiringSnapshot } from "../_lib/hubWiring";
import { buildSourceLedgerPayload } from "../source-ledger/route";
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
const execFileAsync = promisify(execFile);
const OPENCLAW_REPO_ROOT = "/Users/burakokyay/.openclaw/mission-control-frontend-restored";
const OPENCLAW_REPO_REMOTE = "https://github.com/abhi1693/openclaw-mission-control.git";
const HOUSE_ORCHESTRATOR_STATE = "/Users/burakokyay/.openclaw/state/cofiatrading_world_house_orchestrator.json";
const CONSOLE_IA_PACKETS_DIR = "/Users/burakokyay/.openclaw/state/console_ia/packets";
const CONSOLE_IA_RESPONSES_DIR = "/Users/burakokyay/.openclaw/state/console_ia/responses";
const CONSOLE_IA_PACKETS_JSONL = "/Users/burakokyay/.openclaw/state/console_ia/packets.jsonl";
const TOOL_OPERATING_CONTRACTS = "/Users/burakokyay/.openclaw/config/tool_operating_contracts.json";
const WORKER_POOL_MANIFEST = "/Users/burakokyay/.openclaw/state/trading_os/worker_pool_manifest_latest.json";
const CLAUDE_CONTROL_LOOP_STATE = "/Users/burakokyay/.openclaw/state/claude_7h/control_loop_latest.json";

const endpoints = {
  revenue: "local://cof_state.json (readLocalRevenue — fallback Abidjan :8430 COUPÉ 20260529)",
  houses: process.env.COF_CENTRAL_BRAIN_HOUSES_URL ?? `${HOST}:8767/api/central-brain/houses`,
  publisher: process.env.COF_PUBLISHER_STATUS_URL ?? `${HOST}:8540/api/status`,
  publisherCanon: process.env.COF_PUBLISHER_CANON_URL ?? `${HOST}:8540/api/publisher/single-canon-hub`,
  publisherAssetBridge: process.env.COF_PUBLISHER_ASSET_BRIDGE_URL ?? `${HOST}:8540/api/publisher/hub-bridge/assets?limit=2278`,
  publisherVideoBridge: process.env.COF_PUBLISHER_VIDEO_BRIDGE_URL ?? `${HOST}:8540/api/publisher/hub-bridge/videos?limit=160`,
  publisherNativeRenders: process.env.COF_PUBLISHER_NATIVE_RENDERS_URL ?? `${OPENCLAW_API}/api/v1/cof/publisher/renders`,
  publisherNativeState: process.env.COF_PUBLISHER_NATIVE_STATE_URL ?? `${OPENCLAW_API}/api/v1/cof/publisher/state`,
  publisherNativeTiers: process.env.COF_PUBLISHER_NATIVE_TIERS_URL ?? `${OPENCLAW_API}/api/v1/cof/publisher/tiers`,
  ack: process.env.COF_ACK_HEALTH_URL ?? `${HOST}:8443/health`,
  rtk: process.env.COF_RTK_HEALTH_URL ?? `${HOST}:11435/rtk/health`,
  proofLedger: process.env.COF_PROOF_LEDGER_HOME_URL ?? null,
};

// Services canon probes LIVE (cockpit Hub Vivant). OpenClaw official local network
// model = one loopback Gateway on :18789; legacy duplicate ports are not canon.
const SERVICE_PROBES: ReadonlyArray<{ id: string; label: string; url: string; role: string; onDemand?: boolean }> = [
  { id: "hub_8430", label: "Hub backend :8430 (data API)", url: `${HOST}:8430/health`, role: "Backend data only; cockpit canon = :3000" },
  { id: "mission_control_3000", label: "Mission Control :3000", url: `${HOST}:3000/cofiatrading-world-control`, role: "Cockpit Hub Vivant NY" },
  { id: "central_brain_8767", label: "Central Brain :8767", url: `${HOST}:8767/api/central-brain/houses`, role: "Registry 15 maisons SSOT" },
  { id: "cofiapublisher_native_8000", label: "CofiaPublisher native :8000", url: `${OPENCLAW_API}/api/v1/cof/publisher/state`, role: "Pipeline vidéos natif Mission Control" },
  { id: "cofiapublisher_8540", label: "CofiaPublisher legacy :8540", url: `${HOST}:8540/api/status`, role: "Dashboard Publisher legacy / preview" },
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
  { id: "youtube", name: "YouTube CofiaPublisher V30", status: "CANON_GATE", problem: "MP4 prêts selon scan publisher; 0 publié, OAuth refresh expiré, channel art absent", next_action: "OAuth refresh Erwin 2min + publish video-01 unlisted → Reviewer proof gate → public + channel art brand", owner_agent: "Nova + Isrāfīl", proof_source: "assetsWarehouse.remotionOutDir + Reviewer proof gate" },
  { id: "facebook", name: "Facebook Page COFIA Trading", status: "AWAITING_SETUP", problem: "Page 1136548789543573 existe, about/desc/cover/profile VIDES, 0 followers, Meta Verified ⭐ payé non appliqué", next_action: "Upload cover + profile + about + premier post + soumettre Verified Application", owner_agent: "Luna", proof_source: "Meta Graph API page_token + brand-kit-2026-05" },
  { id: "tiktok", name: "TikTok", status: "AWAITING_SETUP", problem: "TIKTOK_ACCESS_TOKEN placeholder, 0 short publié, profile vide", next_action: "Génère token dev portal (Erwin 10min) + Sonic cron 1 short/jour debunk", owner_agent: "Sonic", proof_source: "TikTok Developer Portal app" },
  { id: "telegram_free", name: "Telegram FREE -1001279616913", status: "PARTIAL", problem: "Members à vérifier via feed frais; broadcasts sporadiques, pas de preuve message-count frais dans ce snapshot", next_action: "Câbler feed Telegram frais + broadcast educational hebdo W22 captions premium V8/V12", owner_agent: "Sonic + David", proof_source: "owned_channel canon; runtime feed fresh missing" },
  { id: "telegram_vip", name: "Telegram VIP", status: "PARTIAL", problem: "Members à vérifier via webhook/feed frais; usage prouvé seulement si invite Stripe + signal journalier horodatés", next_action: "Câbler Welcome flow auto post-Stripe + preuve signal STRAT-17 quotidien Marco", owner_agent: "Antho + Marco", proof_source: "Stripe webhook target canon; fresh dispatch proof missing" },
  { id: "whatsapp_business", name: "WhatsApp Business WABA US", status: "PARTIAL", problem: "Phone +1 555-964-8716 VERIFIED, template cofia_welcome_vip_fr PENDING Meta ~24h, 0 message envoyé", next_action: "Wait approval template + send 3 brokers + onboarding VIP", owner_agent: "David + Jack", proof_source: "Meta Graph waba_id 1320675216711048 template review" },
  { id: "gmail_brokers", name: "Gmail brokers reclaim", status: "PARTIAL", problem: "3 drafts (Nicolas/Fabienne/François) JAMAIS sent depuis 24h+", next_action: "Send via Gmail API Python OAuth refresh_token OR WhatsApp template approved", owner_agent: "Jack", proof_source: "Gmail drafts r-1313936... r-885955... r-412545..." },
  { id: "stripe", name: "Stripe", status: "PARTIAL", problem: "MRR/VIP/past_due lus depuis sources locales, mais divergence snapshot/system-health à auditer avant claim LIVE unifié", next_action: "Comparer snapshot ↔ :8000/api/v1/cof/past-due avant toute relance past_due", owner_agent: "Mikā'īl", proof_source: "readLocalRevenue + backend NY :8000 Stripe read-only" },
  { id: "brokers_cellxpert", name: "Brokers CellXpert", status: "CANON_GATE", problem: "broker_accounts à vérifier via scan frais; IP whitelist ES pending, PDFs daily non prouvés dispatchés", next_action: "IP whitelist fix + dispatch quotidien WhatsApp/Gmail PDF reclaim", owner_agent: "Jack", proof_source: "broker_accounts Iron CRM + affiliate_contacts.json" },
  { id: "notion", name: "Notion workspace", status: "PARTIAL", problem: "3 DBs créées (38 Anges + 4 Leviers + 11 Prices), pas de sync cron Hub↔Notion ni orders canon", next_action: "Script notion_to_orders.py LaunchAgent 1h + Welcome VIP page template + canon docs B2B", owner_agent: "Steward + Antho", proof_source: "Notion API 3 DBs ID 7a2d1ad6 + 7c54ea95 + 4e93d058" },
  { id: "linear", name: "Linear cofiatrading team", status: "PARTIAL", problem: "Issues et MCP existent, mais pas de cycles/projects live prouvés dans ce snapshot", next_action: "Câbler cycles 2 weekly + projects par 4 leviers ROI + roadmap visible Hub", owner_agent: "Sentinel", proof_source: "Linear MCP list_issues team Cofiatrading; workflow usage fresh missing" },
  { id: "github", name: "GitHub @erwin-cmyk", status: "PARTIAL", problem: "Repos accessibles, mais README/CI/CD/topics et preuve d'exploitation business restent incomplets", next_action: "README pro tous repos + badges + topics + GitHub Actions CI/CD", owner_agent: "Atlas + Codex", proof_source: "github.com/erwin-cmyk audit repos; business workflow fresh missing" },
  { id: "vercel", name: "Vercel cofiatrading.com", status: "PARTIAL", problem: "Site déployé, landing pages SEO i18n incomplet, pas de tracking conversions ni Meta Pixel", next_action: "i18n EN/FR/ES/AR/TR + analytics + Meta Pixel CAPI v22", owner_agent: "Atlas", proof_source: "vercel.app cof-trading-site project" },
  { id: "supabase", name: "Supabase pxynrgypfkoyuixsxvsj", status: "PARTIAL", problem: "Service accessible mais 9 advisors security RLS always_true backdoor (COF-130 P0), 149 emails newsletter jamais envoyée", next_action: "Fix RLS policies + envoyer newsletter weekly via Resend re-activé", owner_agent: "Atlas + Mikā'īl", proof_source: "Supabase MCP get_advisors security warnings" },
  { id: "n8n", name: "n8n coftrading.app.n8n.cloud", status: "PARTIAL", problem: "9 workflows ACTIVE dont fan-out publish, erreurs config + credentials sync manquantes", next_action: "Audit + fix workflows erreurs + credentials sync + webhook publish-approve", owner_agent: "Steward", proof_source: "n8n cloud workflow id kXojepCAXV5ktVsf" },
  { id: "cofiapublisher", name: "CofiaPublisher pipeline V30", status: "PARTIAL", problem: "Server :8540 répond, MP4 prêts selon scan live, mais publication externe non prouvée; service live ≠ mission publication live", next_action: "Installer refresh ciblé 300s + drawer dans cockpit :3000 + Gemini Vision J+3", owner_agent: "Nova", proof_source: "curl :8540/api/status + assetsWarehouse.remotionOutDir; publish proof missing" },
  { id: "hedra", name: "Hedra Character-3 lipsync", status: "AWAITING_SETUP", problem: "$30/mo PAYÉ depuis 2026-05-18, HEDRA_API_KEY not set, 6 tentatives FAILED (faux-vert)", next_action: "Set HEDRA_API_KEY env + premier video talking-head Erwin Menorca + ElevenLabs voice clone", owner_agent: "Nova + Luna", proof_source: "hedra.com account $30/mo invoices" },
  { id: "wispr_flow", name: "Wispr Flow voice", status: "PARTIAL", problem: "App installée selon canon local, mais ce snapshot n'a pas de preuve d'événement voice récent", next_action: "Ajouter heartbeat Kevin/Wispr horodaté avant claim LIVE", owner_agent: "Kevin", proof_source: "Wispr.app dictation Warp Terminal; fresh event proof missing" },
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

const readBoolean = (record: Record<string, unknown>, keys: string[]): boolean | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
};

const readRecordList = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];

const readNonEmptyRecord = (value: unknown): Record<string, unknown> | null => {
  const record = toRecord(value);
  return Object.keys(record).length > 0 ? record : null;
};

const readPublisherWorkorders = (...values: unknown[]): Record<string, unknown>[] | Record<string, Record<string, unknown>> | null => {
  for (const value of values) {
    const list = readRecordList(value);
    if (list.length > 0) return list.slice(0, 24);
    const record = readNonEmptyRecord(value);
    if (!record) continue;
    const entries = Object.entries(record)
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1]))
      .slice(0, 24);
    if (entries.length > 0) return Object.fromEntries(entries);
  }
  return null;
};

const buildPublisherCanonSnapshot = (result: FetchResult) => {
  const payload = toRecord(result.data);
  const canonical = toRecord(payload.canonical);
  const counts = toRecord(payload.counts);
  const verdict = readString(payload, ["verdict", "status"]) ?? (result.ok ? "LIVE_HTTP_NO_VERDICT" : "SOURCE_DOWN");

  return {
    ok: result.ok && verdict === "CANON_REGISTERED_GREEN",
    status: verdict,
    sourceTag: readString(payload, ["source_tag", "sourceTag"]),
    canonical: {
      path: readString(canonical, ["path"]),
      url: readString(canonical, ["url"]),
      exists: readBoolean(canonical, ["exists"]),
    },
    counts: {
      assetsTotal: readNumber(counts, ["assets_total", "assetsTotal"]),
      assetsWiredOrAvailable: readNumber(counts, ["assets_wired_or_available", "assetsWiredOrAvailable"]),
      assetsToWire: readNumber(counts, ["assets_to_wire", "assetsToWire"]),
      duplicatePublisherHtml: readNumber(counts, ["duplicate_publisher_html", "duplicatePublisherHtml"]),
      activeRenders: readNumber(counts, ["active_renders", "activeRenders"]),
      brollTotal: readNumber(counts, ["broll_total", "brollTotal"]),
      pexelsBroll: readNumber(counts, ["pexels_broll", "pexelsBroll"]),
      pixabayBroll: readNumber(counts, ["pixabay_broll", "pixabayBroll"]),
      unsplashBroll: readNumber(counts, ["unsplash_broll", "unsplashBroll"]),
      producedProven: readNumber(counts, ["produced_proven", "producedProven"]),
      producedProvenConditional: readNumber(counts, ["produced_proven_conditional", "producedProvenConditional"]),
      goldenProven: readNumber(counts, ["golden_proven", "goldenProven"]),
      failedGate: readNumber(counts, ["failed_gate", "failedGate"]),
      unprovenPartial: readNumber(counts, ["unproven_partial", "unprovenPartial"]),
      provenTotalPublishableLocked: readNumber(counts, ["proven_total_publishable_locked", "provenTotalPublishableLocked"]),
    },
    surfaces: readRecordList(payload.surfaces).map((surface) => ({
      id: readString(surface, ["id"]) ?? "unknown",
      label: readString(surface, ["label"]) ?? "UNKNOWN",
      status: readString(surface, ["status"]) ?? "UNKNOWN",
      url: readString(surface, ["url"]),
      path: readString(surface, ["path"]),
    })),
    stations: readRecordList(payload.stations).map((station) => ({
      id: readString(station, ["id"]) ?? "unknown",
      label: readString(station, ["label"]) ?? "UNKNOWN",
      owner: readString(station, ["owner"]) ?? "UNKNOWN",
      status: readString(station, ["status"]) ?? "UNKNOWN",
      endpoint: readString(station, ["endpoint"]),
    })),
    assets: readRecordList(payload.assets).map((asset) => ({
      id: readString(asset, ["id"]) ?? "unknown",
      label: readString(asset, ["label"]) ?? "UNKNOWN",
      state: readString(asset, ["state", "status"]) ?? "UNKNOWN",
      role: readString(asset, ["role"]) ?? "",
      count: readNumber(asset, ["count"]),
      path: readString(asset, ["path"]),
    })),
    blockers: readRecordList(payload.blockers).map((blocker) => ({
      id: readString(blocker, ["id"]) ?? "unknown",
      status: readString(blocker, ["status"]) ?? "UNKNOWN",
      impact: readString(blocker, ["impact"]) ?? "",
      patch: readString(blocker, ["patch"]) ?? "",
    })),
    officialDocs: readRecordList(payload.official_docs ?? payload.officialDocs).map((doc) => ({
      id: readString(doc, ["id"]) ?? "unknown",
      label: readString(doc, ["label"]) ?? "UNKNOWN",
      url: readString(doc, ["url"]) ?? "",
    })),
  };
};

const readJson = async (url: string | null, timeoutMs = 3500): Promise<FetchResult> => {
  if (!url) {
    return {
      ok: false,
      status: null,
      data: null,
      error: "SOURCE_NOT_CONFIGURED",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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

const readOpenClawRepoProof = async () => {
  try {
    const config = await readFile(`${OPENCLAW_REPO_ROOT}/.git/config`, "utf8");
    const head = (await readFile(`${OPENCLAW_REPO_ROOT}/.git/HEAD`, "utf8")).trim();
    const remoteOk = config.includes(OPENCLAW_REPO_REMOTE);
    const branch = head.startsWith("ref: refs/heads/") ? head.replace("ref: refs/heads/", "") : "detached";
    const commit = head.startsWith("ref:")
      ? (await readFile(`${OPENCLAW_REPO_ROOT}/.git/${head.replace("ref: ", "")}`, "utf8")).trim()
      : head;
    const ok = remoteOk && commit.length >= 7;
    return {
      ok,
      status: ok ? "GREEN_LOCAL_REMOTE" : "AMBER_LOCAL_REMOTE_REVERIFY",
      sourceTag: "OPENCLAW_MISSION_CONTROL_GITHUB_LOCAL_REMOTE_20260601",
      repoRoot: OPENCLAW_REPO_ROOT,
      remoteUrl: OPENCLAW_REPO_REMOTE,
      branch,
      commit,
      proof: `${OPENCLAW_REPO_ROOT}/.git/config origin=${remoteOk ? OPENCLAW_REPO_REMOTE : "REMOTE_MISMATCH"} branch=${branch} commit=${commit.slice(0, 12)}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: "SOURCE_DOWN",
      sourceTag: "OPENCLAW_MISSION_CONTROL_GITHUB_LOCAL_REMOTE_20260601",
      repoRoot: OPENCLAW_REPO_ROOT,
      remoteUrl: OPENCLAW_REPO_REMOTE,
      branch: null,
      commit: null,
      proof: error instanceof Error ? error.message : "repo proof read failed",
    };
  }
};

const readHouseOrchestratorState = async () => {
  try {
    const payload = JSON.parse(await readFile(HOUSE_ORCHESTRATOR_STATE, "utf8")) as { ok?: boolean; houseMissions?: unknown[] };
    return payload?.ok === true && Array.isArray(payload.houseMissions) ? payload : null;
  } catch {
    return null;
  }
};

const readToolOperatingContracts = async () => {
  try {
    const raw = JSON.parse(await readFile(TOOL_OPERATING_CONTRACTS, "utf8")) as {
      source_tag?: string;
      policy?: string;
      generated_at_utc?: string;
      contracts?: Array<Record<string, unknown>>;
    };
    const contracts = Array.isArray(raw.contracts) ? raw.contracts : [];
    const normalized = contracts
      .filter((contract) => readString(contract, ["id"]) && readString(contract, ["label"]))
      .map((contract) => {
        const label = readString(contract, ["label"]) ?? "Tool";
        const machineIds = Array.isArray(contract.machine_ids)
          ? contract.machine_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
          : [];
        return {
          id: readString(contract, ["id"]) ?? label.toLowerCase(),
          machineIds,
          label,
          short: readString(contract, ["short"]) ?? label.slice(0, 3).toUpperCase(),
          houseId: readString(contract, ["house_id"]) ?? "central_brain",
          owner: readString(contract, ["owner"]) ?? "Central Brain",
          purpose: readString(contract, ["purpose"]) ?? "Utilite a documenter.",
          usedWhen: readString(contract, ["used_when"]) ?? "Quand une mission le demande.",
          agentRule: readString(contract, ["agent_rule"]) ?? "Usage controle par Proof Ledger.",
          requiredInput: readString(contract, ["required_input"]) ?? "Mission sourcee.",
          requiredOutput: readString(contract, ["required_output"]) ?? "Artefact verifiable.",
          proofRequired: readString(contract, ["proof_required"]) ?? "Preuve locale + Proof Ledger.",
          workGate: readString(contract, ["work_gate"]) ?? "Ne compte pas comme travail sans execution prouvee.",
          costRule: readString(contract, ["cost_rule"]) ?? "Cout a justifier par mission.",
        };
      });
    return {
      ok: true,
      sourceTag: readString(raw, ["source_tag"]) ?? "COFIAT_TOOL_OPERATING_CONTRACTS",
      policy: readString(raw, ["policy"]) ?? "NO_FAKE_WORK_TOOL_CONTRACT",
      generatedAtUtc: readString(raw, ["generated_at_utc"]),
      sourcePath: TOOL_OPERATING_CONTRACTS,
      summary: {
        contracts: normalized.length,
        machineAliases: normalized.reduce((total, contract) => total + contract.machineIds.length, 0),
        houses: new Set(normalized.map((contract) => contract.houseId)).size,
      },
      contracts: normalized,
    };
  } catch (error) {
    return {
      ok: false,
      sourceTag: "COFIAT_TOOL_OPERATING_CONTRACTS",
      policy: "NO_FAKE_WORK_TOOL_CONTRACT",
      sourcePath: TOOL_OPERATING_CONTRACTS,
      blocker: error instanceof Error ? error.message : "contracts read failed",
      contracts: [],
    };
  }
};

const readHubWiring = async () => {
  try {
    return await buildHubWiringSnapshot();
  } catch {
    return null;
  }
};

const readHubSourceLedger = async () => {
  try {
    return await buildSourceLedgerPayload();
  } catch {
    return null;
  }
};

const readConsoleIaProof = async () => {
  try {
    const packetsStat = await stat(CONSOLE_IA_PACKETS_DIR);
    return {
      ok: true,
      status: "LOCAL_PACKET_ROUTE_READY",
      sourceTag: "CONSOLE_IA_LOCAL_PACKET_ROUTE_SSR_20260601",
      mode: "LOCAL_PACKET_READY",
      proof: `${CONSOLE_IA_PACKETS_DIR} · mtime=${packetsStat.mtime.toISOString()}`,
      paths: {
        packetsDir: CONSOLE_IA_PACKETS_DIR,
        responsesDir: CONSOLE_IA_RESPONSES_DIR,
        packetsJsonl: CONSOLE_IA_PACKETS_JSONL,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: "AMBER_REVERIFY",
      sourceTag: "CONSOLE_IA_LOCAL_PACKET_ROUTE_SSR_20260601",
      mode: "LOCAL_PACKET_UNAVAILABLE",
      proof: error instanceof Error ? error.message : "Console IA packets dir unavailable",
      paths: {
        packetsDir: CONSOLE_IA_PACKETS_DIR,
        responsesDir: CONSOLE_IA_RESPONSES_DIR,
        packetsJsonl: CONSOLE_IA_PACKETS_JSONL,
      },
    };
  }
};

const readOpenClaw = async (path: string): Promise<FetchResult> => {
  const localAuthToken = await getLocalAuthToken();
  if (!localAuthToken) {
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
        Authorization: `Bearer ${localAuthToken}`,
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
  assetsWarehouse,
}: {
  revenue: Record<string, unknown>;
  brokers: Record<string, unknown>;
  offers: SanitizedOffer[];
  garageTasks: SanitizedTask[];
  knowledge: Record<string, KnowledgeSnapshot>;
  publisher: Record<string, unknown>;
  proofLedger: ProofLedgerSnapshot;
  assetsWarehouse: Awaited<ReturnType<typeof readAssetsWarehouse>>;
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
  const rendersNative = readNumber(publisher, ["output_dir_count", "renders_count", "count", "renders"]);
  const orphanNative = readNumber(publisher, ["orphan_count", "orphan"]);
  const archivedNative = readNumber(publisher, ["archived_count", "archived"]);
  const goldProvedNative = readNumber(publisher, ["gold_proved_count", "gold_proved"]);
  const publishLockReason = readString(publisher, ["publish_lock_reason"]);
  const publisherSourceTag = readString(publisher, ["source_tag", "sourceTag"]) ?? "CofiaPublisher native source";
  const assetFactoryHasLiveCount = [
    assetsWarehouse.assetsInventoryCount,
    assetsWarehouse.mp4Count,
    assetsWarehouse.captionsCount,
  ].some((value) => typeof value === "number");
  const assetFactorySource = assetFactoryHasLiveCount
    ? assetsWarehouse.sourceTag
    : "STATIC_CANON_REFERENCE_ONLY";

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
      source: assetFactoryHasLiveCount
        ? "filesystem_assets_warehouse + CofiaPublisher"
        : "STATIC_CANON_REFERENCE_ONLY + CofiaPublisher",
      asset_factory_source: assetFactorySource,
      asset_factory_static_reference: ASSET_FACTORY_CANON,
      asset_warehouse_ok: assetsWarehouse.ok,
      assets_count: assetsWarehouse.assetsInventoryCount,
      content_pieces: assetsWarehouse.mp4Count,
      brochures: null,
      scripts: assetsWarehouse.captionsCount,
      renders_native: rendersNative,
      status: "AMBER",
      key_metrics: {
        assets_count: assetsWarehouse.assetsInventoryCount,
        content_pieces: assetsWarehouse.mp4Count,
        brochures: null,
        scripts: assetsWarehouse.captionsCount,
        captions_count: assetsWarehouse.captionsCount,
        asset_warehouse_ok: assetsWarehouse.ok,
        asset_warehouse_errors: assetsWarehouse.errors,
        renders_native: rendersNative,
        archived_native: archivedNative,
        orphan_native: orphanNative,
        gold_proved_native: goldProvedNative,
      },
      last_proof: publisherTruck?.lastProof ?? publisherSourceTag,
      next_checkpoint: publisherTruck?.nextAction ?? "Certifier les renders orphelins; publication externe verrouillee",
      gate_required: "PUBLISH locked",
      blockers: [
        orphanNative === null ? "Renders orphelins: source native manquante" : `${orphanNative} renders orphelins sous regle native`,
        publishLockReason ?? "R8_ERWIN_GATE_EXTERNAL_PUBLISH",
      ],
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
const ASSET_VAULT_PATH =
  process.env.COF_ASSET_VAULT_PATH ??
  "/Users/burakokyay/.openclaw/state/mission_control/asset_vault.json";
const DEEP_STUDIO_MANIFEST_PATH =
  process.env.COF_DEEP_STUDIO_MANIFEST_PATH ??
  "/Users/burakokyay/.openclaw/state/cofiapublisher/universal_studio/asset_manifest_global.json";
const IMAGE_GENERATION_MANIFEST_PATH =
  process.env.COF_IMAGE_GENERATION_MANIFEST_PATH ??
  "/Users/burakokyay/.openclaw/state/cofiapublisher/universal_studio/orders/studio-20260602T170805Z-anime_episode-1ada2b/image_generation_manifest.json";
const IMAGE_GENERATION_MANIFEST_ENDPOINT =
  process.env.COF_IMAGE_GENERATION_MANIFEST_ENDPOINT ??
  `${OPENCLAW_API}/api/v1/cof/publisher/image-generation-manifest`;
const LATEST_MP4_ROUTE = "/api/cofiatrading-world-control/remotion/latest-mp4";

async function readLatestMp4FromRemotionOut() {
  const files = await readdir(REMOTION_OUT_DIR);
  let latest: {
    stem: string;
    filename: string;
    path: string;
    url: string;
    sizeBytes: number;
    sizeMb: number;
    mtimeUtc: string;
    sourceTag: string;
  } | null = null;
  let latestMtimeMs = -1;

  for (const filename of files) {
    if (!filename.toLowerCase().endsWith(".mp4")) continue;
    const path = join(REMOTION_OUT_DIR, filename);
    const fileStat = await stat(path);
    if (!fileStat.isFile() || fileStat.mtimeMs <= latestMtimeMs) continue;
    latestMtimeMs = fileStat.mtimeMs;
    latest = {
      stem: basename(filename, extname(filename)),
      filename,
      path,
      url: `${LATEST_MP4_ROUTE}?v=${Math.round(fileStat.mtimeMs)}`,
      sizeBytes: fileStat.size,
      sizeMb: Math.round((fileStat.size / (1024 * 1024)) * 10) / 10,
      mtimeUtc: fileStat.mtime.toISOString(),
      sourceTag: "REMOTION_OUT_LATEST_MP4_DIRECT_SNAPSHOT_20260603",
    };
  }

  return latest;
}

async function readAssetsWarehouse() {
  const errors: string[] = [];
  let mp4Count: number | null = null;
  let latestMp4: Awaited<ReturnType<typeof readLatestMp4FromRemotionOut>> = null;
  let captionsCount: number | null = null;
  let assetsInventoryCount: number | null = null;
  let assetVaultCount: number | null = null;
  let assetVaultRawFileCount: number | null = null;
  let deepStudioAssetCount: number | null = null;

  try {
    const files = await readdir(REMOTION_OUT_DIR);
    mp4Count = files.filter((file) => file.toLowerCase().endsWith(".mp4")).length;
    latestMp4 = await readLatestMp4FromRemotionOut();
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
  try {
    const parsed = JSON.parse(await readFile(ASSET_VAULT_PATH, "utf8")) as { summary?: { asset_count?: unknown; raw_file_count?: unknown } };
    assetVaultCount = typeof parsed.summary?.asset_count === "number" ? parsed.summary.asset_count : null;
    assetVaultRawFileCount = typeof parsed.summary?.raw_file_count === "number" ? parsed.summary.raw_file_count : null;
  } catch (error) {
    errors.push(`asset_vault:${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const parsed = JSON.parse(await readFile(DEEP_STUDIO_MANIFEST_PATH, "utf8")) as { summary?: { asset_count?: unknown } };
    deepStudioAssetCount = typeof parsed.summary?.asset_count === "number" ? parsed.summary.asset_count : null;
  } catch (error) {
    errors.push(`deep_studio_manifest:${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    ok:
      typeof mp4Count === "number" &&
      typeof captionsCount === "number" &&
      typeof assetsInventoryCount === "number" &&
      latestMp4 !== null,
    sourceTag: "filesystem_assets_warehouse_snapshot_remotion_latest_mp4_20260603",
    mp4Count,
    latestMp4,
    captionsCount,
    assetsInventoryCount,
    assetVaultCount,
    assetVaultRawFileCount,
    deepStudioAssetCount,
    paths: {
      remotionOutDir: REMOTION_OUT_DIR,
      captionsDir: CAPTIONS_DIR,
      assetsInventoryPath: ASSETS_INVENTORY_PATH,
      assetVaultPath: ASSET_VAULT_PATH,
      deepStudioManifestPath: DEEP_STUDIO_MANIFEST_PATH,
      imageGenerationManifestPath: IMAGE_GENERATION_MANIFEST_PATH,
      imageGenerationManifestEndpoint: IMAGE_GENERATION_MANIFEST_ENDPOINT,
    },
    errors,
  };
}

const AGENTS_CANON_PATH =
  process.env.COF_AGENTS_CANON_PATH ??
  "/Users/burakokyay/.openclaw/config/agents_visual_identity_canon.json";

const orgRoleForRankLayer = (rankLayer: string) => {
  const normalized = rankLayer.toLowerCase();
  if (normalized.startsWith("l0")) return "owner";
  if (normalized.startsWith("l1")) return "co_ceo";
  if (normalized.includes("auxiliaire")) return "voice";
  if (normalized.startsWith("l2")) return "manager";
  if (normalized.startsWith("l3")) return "chief";
  if (normalized.includes("executor")) return "worker";
  return "specialist";
};

const rankLayerWeightFor = (rankLayer: string) => {
  const normalized = rankLayer.toLowerCase();
  if (normalized.startsWith("l0")) return 100;
  if (normalized.startsWith("l1")) return 90;
  if (normalized.startsWith("l2")) return 78;
  if (normalized.startsWith("l3")) return 66;
  if (normalized.includes("specialist")) return 48;
  if (normalized.includes("executor")) return 40;
  return 30;
};

async function readAgentsCanon() {
  try {
    const raw = await readFile(AGENTS_CANON_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.agents) ? (parsed.agents as Record<string, unknown>[]) : [];
    const agents = list.map((a) => {
      const rankLayer = typeof a.rank_layer === "string" ? a.rank_layer : "";
      return {
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
        rankLayer,
        rankLayerWeight: rankLayerWeightFor(rankLayer),
        orgRole: orgRoleForRankLayer(rankLayer),
        boss: typeof a.boss === "string" ? a.boss : "",
        engine: typeof a.engine === "string" ? a.engine : "",
        responsibilities: Array.isArray(a.responsibilities)
          ? (a.responsibilities as unknown[]).filter((r): r is string => typeof r === "string")
          : [],
      };
    });
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

const readWorkerPoolSnapshot = async () => {
  const [manifest, controlLoop] = await Promise.all([
    readSafeJsonFile<Record<string, unknown> | null>(WORKER_POOL_MANIFEST, null),
    readSafeJsonFile<Record<string, unknown> | null>(CLAUDE_CONTROL_LOOP_STATE, null),
  ]);
  const nowMs = Date.now();
  let fileMtimeUtc: string | null = null;
  let fileAgeSec: number | null = null;
  try {
    const manifestStat = await stat(WORKER_POOL_MANIFEST);
    fileMtimeUtc = manifestStat.mtime.toISOString();
    fileAgeSec = Math.max(0, Math.round((nowMs - manifestStat.mtimeMs) / 1000));
  } catch {
    fileMtimeUtc = null;
    fileAgeSec = null;
  }
  const freshnessStatus =
    fileAgeSec === null ? "SOURCE_MISSING" : fileAgeSec > 180 ? "STALE" : "FRESH";
  if (!manifest) {
    return {
      ok: false,
      status: "SOURCE_MISSING",
      sourceTag: null,
      snapshotId: null,
      sourcePath: WORKER_POOL_MANIFEST,
      fileMtimeUtc,
      fileAgeSec,
      freshnessStatus,
      summary: null,
      laneDistribution: {},
      activeLaneDistribution: {},
      controlLoop: controlLoop
        ? {
            snapshotId: readString(controlLoop, ["snapshot_id"]),
            status: readString(controlLoop, ["status"]),
            verdict: readString(toRecord(controlLoop.self_challenge), ["verdict"]),
            handoffCounts: toRecord(toRecord(controlLoop.handoff_audit).counts),
          }
        : null,
    };
  }

  const summary = toRecord(manifest.summary);
  const controlLoopAudit = toRecord(controlLoop?.handoff_audit);
  const controlLoopChallenge = toRecord(controlLoop?.self_challenge);
  const blockedSessionLimit = readNumber(summary, ["blocked_session_limit"]) ?? 0;
  const failed = readNumber(summary, ["failed"]) ?? 0;
  const running = readNumber(summary, ["running"]) ?? 0;
  const sessionLimitParkedDuplicate = readNumber(summary, ["session_limit_parked_duplicate"]) ?? 0;
  const staleProcessReaped = readNumber(summary, ["stale_process_reaped"]) ?? 0;
  const runningProcessUnverified = readNumber(summary, ["running_process_unverified"]) ?? 0;
  const status =
    freshnessStatus !== "FRESH" ? "AMBER_STALE" :
    blockedSessionLimit > 0 ? "WATCH_SESSION_LIMIT" :
    failed > 0 ? "WATCH_FAILED_WORKERS" :
    staleProcessReaped > 0 ? "WATCH_STALE_PROCESSES" :
    runningProcessUnverified > 0 ? "WATCH_RUNNING_UNVERIFIED" :
    running > 0 ? "WATCH_RUNNING" :
    sessionLimitParkedDuplicate > 0 ? "WATCH_PARKED_DUPLICATES" :
    "WATCH_IDLE";

  return {
    ok: freshnessStatus === "FRESH",
    status,
    sourceTag: readString(manifest, ["source_tag"]),
    snapshotId: readString(manifest, ["snapshot_id"]),
    sourcePath: WORKER_POOL_MANIFEST,
    fileMtimeUtc,
    fileAgeSec,
    freshnessStatus,
    summary: {
      workers: readNumber(summary, ["workers"]),
      active: readNumber(summary, ["active"]),
      running,
      runningRealPool: readNumber(summary, ["running_real_pool", "runningRealPool"]),
      completed: readNumber(summary, ["completed"]),
      failed,
      queuedTasks: readNumber(summary, ["queued_tasks"]),
      queuedTasksTotal: readNumber(summary, ["queued_tasks_total"]),
      queuedTasksDeferred: readNumber(summary, ["queued_tasks_deferred"]),
      queuedTasksResolvedByHandoff: readNumber(summary, ["queued_tasks_resolved_by_handoff", "queuedTasksResolvedByHandoff"]),
      withProof: readNumber(summary, ["with_proof"]),
      blockedSessionLimit,
      sessionLimitParkedDuplicate,
      staleProcessReaped,
      runningProcessUnverified,
      distinctActiveLanes: readNumber(summary, ["distinct_active_lanes"]),
      duplicateRunning: readNumber(summary, ["duplicate_running"]),
      laneSkew: readBoolean(summary, ["lane_skew"]),
    },
    laneDistribution: toRecord(summary.lane_distribution),
    activeLaneDistribution: toRecord(summary.active_lane_distribution),
    controlLoop: controlLoop
      ? {
          snapshotId: readString(controlLoop, ["snapshot_id"]),
          status: readString(controlLoop, ["status"]),
          verdict: readString(controlLoopChallenge, ["verdict"]),
          decisionAllowed: readBoolean(controlLoopChallenge, ["decision_allowed"]),
          handoffCounts: toRecord(controlLoopAudit.counts),
        }
      : null,
  };
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

type AgentsCanonSnapshot = Awaited<ReturnType<typeof readAgentsCanon>>;
type CanonAgentRecord = AgentsCanonSnapshot["agents"][number];

const HOUSE_META = LOCAL_BOARD_HOUSE_MAP.map(([houseId, title, slugs]) => ({
  houseId,
  title,
  slugs: [...slugs],
}));

const BOARD_SLUG_TO_HOUSE = new Map<string, (typeof LOCAL_BOARD_HOUSE_MAP)[number][0]>(
  LOCAL_BOARD_HOUSE_MAP.flatMap(([houseId, , slugs]) => slugs.map((slug) => [slug, houseId] as const)),
);

const DONE_STATUS_PATTERN = /done|closed|complete|archived/i;
const URGENT_PRIORITY_PATTERN = /urgent|high|p0|p1/i;

const normalizeMissionStatus = (status: string) => {
  const normalized = status.toLowerCase();
  if (DONE_STATUS_PATTERN.test(normalized)) return "DONE";
  if (normalized.includes("blocked") || normalized.includes("broken")) return "AMBER";
  if (normalized.includes("local") || normalized.includes("fallback")) return "AMBER";
  if (normalized.includes("active") || normalized.includes("progress") || normalized.includes("todo") || normalized.includes("pending")) return "ACTIVE";
  return status && status !== "UNKNOWN" ? status.toUpperCase() : "CANON";
};

const pickHouseTask = (tasks: SanitizedTask[]) => {
  const active = tasks.filter((task) => !DONE_STATUS_PATTERN.test(task.status));
  const pool = active.length > 0 ? active : tasks;
  return [...pool].sort((left, right) => {
    const leftUrgent = URGENT_PRIORITY_PATTERN.test(left.priority) ? 0 : 1;
    const rightUrgent = URGENT_PRIORITY_PATTERN.test(right.priority) ? 0 : 1;
    return leftUrgent - rightUrgent || (left.dueTime ?? "9999").localeCompare(right.dueTime ?? "9999");
  })[0] ?? null;
};

const proofStatusFor = (proof: string, missionSource?: SanitizedTask | null) => {
  if (!proof || proof === "UNKNOWN") return "MISSING_PROOF";
  if (proof === AGENTS_CANON_PATH || proof.includes("agents_visual_identity_canon")) return "CANON_SOURCE";
  const sourceTag = missionSource?.sourceTag ?? "";
  const failureMode = missionSource?.failureMode ?? "";
  const gate = missionSource?.approvalGate ?? "";
  const proofText = `${proof} ${sourceTag} ${failureMode} ${gate}`.toLowerCase();
  if (
    proofText.includes("fallback local") ||
    proofText.includes("local_trucks_fallback") ||
    proofText.includes("openclaw_api_down") ||
    proofText.includes("read_only_fallback")
  ) {
    return "FALLBACK_ONLY";
  }
  const status = normalizeMissionStatus(missionSource?.status || missionSource?.truckStatus || "UNKNOWN");
  if (missionSource?.lastRunAt && status === "ACTIVE") return "RUNTIME_PROOF";
  return "SOURCE_ONLY";
};

const parseRouteStartHouse = (route: string) => {
  const [from] = route.split("->").map((part) => part.trim());
  return BOARD_SLUG_TO_HOUSE.get(from) ?? (HOUSE_META.some((house) => house.houseId === from) ? from : null);
};

const buildHouseMissions = ({
  agentsCanon,
  openclawRuntime,
  apiAgents,
  boardTaskPayloads,
  garageTasks,
}: {
  agentsCanon: AgentsCanonSnapshot;
  openclawRuntime: Awaited<ReturnType<typeof readOpenClawRuntime>>;
  apiAgents: Record<string, unknown>[];
  boardTaskPayloads: Array<{ board: Record<string, unknown>; tasks: SanitizedTask[] }>;
  garageTasks: SanitizedTask[];
}) => {
  const agentsById = new Map<string, CanonAgentRecord>();
  const runtimeStatusByAgent = new Map<string, string>();
  const tasksByHouse = new Map<string, SanitizedTask[]>();
  const trucksByHouse = new Map<string, SanitizedTask[]>();

  for (const agent of agentsCanon.agents) {
    agentsById.set(normalizeAgentKey(agent.id), agent);
    agentsById.set(normalizeAgentKey(agent.name), agent);
  }

  for (const agent of openclawRuntime.agents) {
    runtimeStatusByAgent.set(normalizeAgentKey(agent.id), agent.runtimeStatus);
    runtimeStatusByAgent.set(normalizeAgentKey(agent.name), agent.runtimeStatus);
  }
  for (const agent of apiAgents) {
    const id = readString(agent, ["id"]);
    const name = readString(agent, ["name"]);
    const status = readString(agent, ["status"]);
    if (!status) continue;
    if (id) runtimeStatusByAgent.set(normalizeAgentKey(id), status);
    if (name) runtimeStatusByAgent.set(normalizeAgentKey(name), status);
  }

  for (const { board, tasks } of boardTaskPayloads) {
    const slug = readString(board, ["slug"]);
    const houseId = slug ? BOARD_SLUG_TO_HOUSE.get(slug) : null;
    if (!houseId) continue;
    tasksByHouse.set(houseId, [...(tasksByHouse.get(houseId) ?? []), ...tasks]);
  }

  for (const truck of garageTasks) {
    const routeHouse = parseRouteStartHouse(truck.route);
    const ownerHouse =
      agentsById.get(normalizeAgentKey(truck.owner))?.house ??
      agentsById.get(normalizeAgentKey(truck.driverAgent))?.house ??
      null;
    const houseId = routeHouse ?? (ownerHouse && HOUSE_META.some((house) => house.houseId === ownerHouse) ? ownerHouse : null);
    if (!houseId) continue;
    trucksByHouse.set(houseId, [...(trucksByHouse.get(houseId) ?? []), truck]);
  }

  const toMissionAgent = (agent: CanonAgentRecord) => {
    const boss = agent.boss ? agentsById.get(normalizeAgentKey(agent.boss)) : null;
    return {
      id: agent.id,
      name: agent.name,
      orgRole: agent.orgRole,
      rankLayer: agent.rankLayer,
      rankLayerWeight: agent.rankLayerWeight,
      bossId: agent.boss || null,
      bossName: boss?.name ?? null,
      roleBadge: agent.roleBadge,
      status:
        runtimeStatusByAgent.get(normalizeAgentKey(agent.id)) ??
        runtimeStatusByAgent.get(normalizeAgentKey(agent.name)) ??
        "CANON_ONLY",
      responsibilities: agent.responsibilities,
      proof: AGENTS_CANON_PATH,
    };
  };

  return HOUSE_META.map(({ houseId, title, slugs }) => {
    const houseAgents = agentsCanon.agents
      .filter((agent) => agent.house === houseId)
      .sort((left, right) => right.rankLayerWeight - left.rankLayerWeight || left.name.localeCompare(right.name));
    const inHouseChiefs = houseAgents.filter((agent) =>
      ["owner", "co_ceo", "manager", "chief", "voice"].includes(agent.orgRole),
    );
    const chiefSource = inHouseChiefs[0] ?? houseAgents[0] ?? null;
    const chief = chiefSource ? toMissionAgent(chiefSource) : null;
    const chiefs = (inHouseChiefs.length > 0 ? inHouseChiefs : chiefSource ? [chiefSource] : []).map(toMissionAgent);
    const workers = houseAgents
      .filter((agent) => !chiefSource || agent.id !== chiefSource.id)
      .map(toMissionAgent);
    const tasks = tasksByHouse.get(houseId) ?? [];
    const trucks = trucksByHouse.get(houseId) ?? [];
    const task = pickHouseTask(tasks);
    const truck = !task ? pickHouseTask(trucks) : null;

    const fallbackResponsibility =
      chiefSource?.responsibilities[0] ??
      houseAgents.flatMap((agent) => agent.responsibilities)[0] ??
      "Mission source manquante";
    const missionSource = task ?? truck;
    const missionProof = missionSource?.lastProof && missionSource.lastProof !== "UNKNOWN"
      ? missionSource.lastProof
      : missionSource
        ? missionSource.sourceOfTruth
        : houseAgents.length > 0
          ? AGENTS_CANON_PATH
          : "NO_AGENT_OR_TASK_SOURCE";
    const missionStatus = missionSource
      ? normalizeMissionStatus(missionSource.status || missionSource.truckStatus)
      : houseAgents.length > 0
        ? "CANON"
        : "SOURCE_GAP";
    const missionTitle = missionSource
      ? missionSource.currentJob !== "UNKNOWN"
        ? missionSource.currentJob
        : missionSource.title
      : fallbackResponsibility;
    const sourceTag = missionSource?.sourceTag ?? (houseAgents.length > 0 ? "agents_visual_identity_canon" : "SOURCE_GAP_NO_HOUSE_AGENT");

    const orgEdges = houseAgents.flatMap((agent) => {
      if (!agent.boss) return [];
      const boss = agentsById.get(normalizeAgentKey(agent.boss));
      if (!boss) return [];
      return [{ fromAgentId: boss.id, toAgentId: agent.id, relation: "boss" as const }];
    });

    return {
      houseId,
      houseTitle: title,
      status: missionStatus,
      sourceTag,
      primaryBoardSlug: slugs[0],
      boardSlugs: slugs,
      creator: {
        houseId,
        chiefAgentId: chief?.id ?? null,
        chiefAgentName: chief?.name ?? null,
      },
      mission: {
        id: missionSource?.id ?? `${houseId}-canon-mission`,
        title: missionTitle,
        status: missionStatus,
        nextAction: missionSource?.nextAction ?? (houseAgents.length > 0 ? fallbackResponsibility : "Relier une source mission ou un agent canon a cette maison"),
        impact: missionSource?.arrImpact ?? "UNKNOWN",
        blocker: missionSource?.failureMode || (missionSource ? "" : houseAgents.length > 0 ? "" : "NO_HOUSE_AGENT_SOURCE"),
        proof: missionProof,
        proofStatus: proofStatusFor(missionProof, missionSource),
        sourceTag,
        taskId: missionSource?.id ?? null,
        route: missionSource?.route && missionSource.route !== "UNKNOWN" ? missionSource.route : null,
      },
      chief,
      chiefs,
      workers,
      agents: houseAgents.map(toMissionAgent),
      orgEdges,
      counts: {
        agents: houseAgents.length,
        chiefs: chiefs.length,
        workers: workers.length,
        activeTasks: tasks.filter((houseTask) => !DONE_STATUS_PATTERN.test(houseTask.status)).length,
        trucks: trucks.length,
      },
      proofs: [
        { label: "agents_canon", source: AGENTS_CANON_PATH, status: agentsCanon.ok ? "OK" : "SOURCE_DOWN" },
        { label: "board_tasks", source: slugs.join(","), status: tasks.length > 0 ? "OK" : "NO_TASK_SOURCE" },
        { label: "mission_proof", source: missionProof, status: proofStatusFor(missionProof, missionSource) },
      ],
    };
  });
};

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
    publisherCanonResult,
    publisherAssetBridgeResult,
    publisherVideoBridgeResult,
    publisherNativeRendersResult,
    publisherNativeStateResult,
    publisherNativeTiersResult,
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
      readJson(endpoints.publisherCanon, 12000),
      readJson(endpoints.publisherAssetBridge, 15000),
      readJson(endpoints.publisherVideoBridge, 10000),
      readJson(endpoints.publisherNativeRenders, 12000),
      readJson(endpoints.publisherNativeState, 12000),
      readJson(endpoints.publisherNativeTiers, 12000),
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
	  const publisherCanon = buildPublisherCanonSnapshot(publisherCanonResult);
	  const publisherAssetBridge = toRecord(publisherAssetBridgeResult.data);
	  const publisherVideoBridge = toRecord(publisherVideoBridgeResult.data);
	  const publisherNativeRenders = toRecord(publisherNativeRendersResult.data);
	  const publisherNativeState = toRecord(publisherNativeStateResult.data);
	  const publisherNativeTiers = toRecord(publisherNativeTiersResult.data);
	  const publisherNativeCounts = toRecord(publisherNativeState.counts ?? publisherNativeRenders.counts);
	  const publisherNativeQuality = toRecord(publisherNativeState.quality_truth);
	  const publisherNativePublishLock = toRecord(publisherNativeState.publish_lock ?? publisherNativeRenders.publish_lock);
	  const publisherNativeBatch = readNonEmptyRecord(publisherNativeState.batch)
	    ?? readNonEmptyRecord(publisherNativeRenders.batch)
	    ?? readNonEmptyRecord(publisherNativeState.keyframes)
	    ?? readNonEmptyRecord(publisherNativeRenders.keyframes);
	  const publisherNativeWorkorders = readPublisherWorkorders(
	    publisherNativeState.workorders,
	    publisherNativeState.work_orders,
	    publisherNativeState.jobs,
	    publisherNativeRenders.workorders,
	    publisherNativeRenders.work_orders,
	    publisherNativeRenders.jobs,
	  );
	  const publisherNativeRenderItems = Array.isArray(publisherNativeRenders.renders)
	    ? publisherNativeRenders.renders
	    : Array.isArray(publisherNativeRenders.items)
	      ? publisherNativeRenders.items
	      : [];
	  const publisherNativeRendersCount = readNumber(publisherNativeCounts, ["renders"])
	    ?? (publisherNativeRenderItems.length > 0 ? publisherNativeRenderItems.length : null);
	  const publisherForRoutes = {
	    ...publisher,
	    output_dir_count: publisherNativeRendersCount ?? readNumber(publisher, ["output_dir_count", "renders_count", "count"]),
	    renders: publisherNativeRendersCount,
	    archived: readNumber(publisherNativeCounts, ["archived"]),
	    archived_count: readNumber(publisherNativeCounts, ["archived"]),
	    orphan: readNumber(publisherNativeCounts, ["orphan"]),
	    orphan_count: readNumber(publisherNativeCounts, ["orphan"]),
	    gold_proved: readNumber(publisherNativeCounts, ["gold_proved", "goldProved"]),
	    gold_proved_count: readNumber(publisherNativeCounts, ["gold_proved", "goldProved"]),
	    publish_lock_reason: readString(publisherNativePublishLock, ["reason"]),
	    source_tag: readString(publisherNativeState, ["source_tag", "sourceTag"])
	      ?? readString(publisherNativeRenders, ["source_tag", "sourceTag"]),
	  };
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
  const assetsWarehouse = await readAssetsWarehouse();
  const workerPool = await readWorkerPoolSnapshot();

  const routes = buildRouteAggregation({
    revenue: unifiedRevenue,
    brokers,
	    offers: offers as SanitizedOffer[],
	    garageTasks,
	    knowledge,
	    publisher: publisherForRoutes,
	    proofLedger,
      assetsWarehouse,
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
    { title: "YouTube OAuth refresh + publish video-01 unlisted", board_id: null, status: "pending", priority: "urgent", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_YOUTUBE_UPLOAD", next_action: "Erwin OAuth Google Cloud Console 2min puis Studio upload + Reviewer proof gate → public" },
    { title: "Instagram premier post brand W22 + bio + 3 stories", board_id: null, status: "pending", priority: "urgent", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_INSTAGRAM_POST", next_action: "Meta Graph API ig_user_id link Page + caption W22 + brand-kit assets" },
    { title: "Facebook Page cover + profile + about + post + Verified", board_id: null, status: "pending", priority: "urgent", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_META_WRITE", next_action: "Upload via Graph API page_token + facebook-page-cover.png 1MB" },
    { title: "Past_due 291€ recovery (Jérôme + Albina + Jérémy)", board_id: null, status: "pending", priority: "urgent", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_STRIPE_PAST_DUE", next_action: "Customer Portal session URL + DM peer_context Iron CRM tg_id" },
    { title: "WhatsApp Business send 3 brokers reclaim", board_id: null, status: "pending", priority: "urgent", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_WHATSAPP_BROKERS", next_action: "Wait template approval Meta + dispatch_whatsapp_meta.py --cadence daily live" },
    { title: "Notion sync cron Hub↔orders canon + Welcome VIP template", board_id: null, status: "pending", priority: "high", due_time: null, arr_impact: "indirect", source_tag: "MUHARRIK_GATE_NOTION_SYNC", next_action: "Script notion_to_orders.py LaunchAgent 1h" },
    { title: "CofiaPublisher refresh + drawer Hub UI", board_id: null, status: "pending", priority: "high", due_time: null, arr_impact: "direct", source_tag: "MUHARRIK_GATE_PUBLISHER_DRAWER", next_action: "Install refresh ciblé 300s + drawer cockpit :3000, sans surface HTML legacy" },
  ];
  const investorRoomEnriched = {
    ...investorRoom,
    next_7_days_tasks: investorRoom.next_7_days_tasks.length > 0 ? investorRoom.next_7_days_tasks : fallbackNext7Days,
  };
  const agentsCanon = await readAgentsCanon();
  const [openclawRepo, consoleIa, houseOrchestrator, toolOperatingContracts, hubSourceLedger, hubWiring] = await Promise.all([
    readOpenClawRepoProof(),
    readConsoleIaProof(),
    readHouseOrchestratorState(),
    readToolOperatingContracts(),
    readHubSourceLedger(),
    readHubWiring(),
  ]);
  const houseMissions = buildHouseMissions({
    agentsCanon,
    openclawRuntime,
    apiAgents,
    boardTaskPayloads,
    garageTasks,
  });
  const generatedAtUtc = new Date().toISOString();
  const snapshotSourceOk = revenueResult.ok || housesResult.ok || publisherResult.ok || publisherCanonResult.ok || publisherNativeStateResult.ok || publisherNativeRendersResult.ok;
  const workerPoolStatus = readString(toRecord(workerPool), ["status"]) ?? "UNKNOWN";
  const publisherState = readString(publisherNativeState, ["state", "status"]) ?? readString(publisher, ["status"]) ?? "UNKNOWN";
  const publisherPublishAllowed = readBoolean(publisherNativePublishLock, ["allowed"]) === true;
  const snapshotWatch =
    workerPoolStatus.includes("WATCH") ||
    workerPoolStatus.includes("SESSION_LIMIT") ||
    publisherState === "DISTRIBUTION_LOCKED" ||
    publisherPublishAllowed === false;
  const snapshotStatus = !snapshotSourceOk ? "DOWN" : snapshotWatch ? "WATCH_READ_ONLY" : "LIVE";

  return NextResponse.json(
    {
      ok: snapshotSourceOk,
      status: snapshotStatus,
      businessGreenAllowed: snapshotStatus === "LIVE",
      fetchedAt: generatedAtUtc,
      generatedAtUtc,
      sourceTag: `COFIATRADING_WORLD_CONTROL_READ_ONLY_SNAPSHOT_${generatedAtUtc.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
      assetsWarehouse,
      agentsCanon,
      openclawRepo,
      consoleIa,
      houseOrchestrator,
      toolOperatingContracts,
      hubSourceLedger,
      hubWiring,
      houseMissions,
      workerPool,
      endpoints: {
        revenue: { ok: revenueResult.ok, status: revenueResult.status },
        houses: { ok: housesResult.ok, status: housesResult.status },
        publisher: { ok: publisherResult.ok, status: publisherResult.status },
        publisherCanon: { ok: publisherCanonResult.ok, status: publisherCanonResult.status },
        publisherAssetBridge: { ok: publisherAssetBridgeResult.ok, status: publisherAssetBridgeResult.status },
        publisherVideoBridge: { ok: publisherVideoBridgeResult.ok, status: publisherVideoBridgeResult.status },
        publisherNativeRenders: { ok: publisherNativeRendersResult.ok, status: publisherNativeRendersResult.status },
        publisherNativeState: { ok: publisherNativeStateResult.ok, status: publisherNativeStateResult.status },
        publisherNativeTiers: { ok: publisherNativeTiersResult.ok, status: publisherNativeTiersResult.status },
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
        ok: publisherNativeStateResult.ok || publisherNativeRendersResult.ok || publisherResult.ok,
        status: readString(publisherNativeState, ["state", "status"])
          ?? readString(publisher, ["status"])
          ?? (publisherNativeStateResult.ok || publisherResult.ok ? "LIVE_HTTP" : "UNKNOWN"),
        service: readString(publisher, ["service"]) ?? "CofiaPublisher",
        outputDirCount: publisherNativeRendersCount ?? readNumber(publisher, ["output_dir_count", "renders_count", "count"]),
      },
      publisherNative: {
        ok: publisherNativeStateResult.ok || publisherNativeRendersResult.ok,
        sourceTag: readString(publisherNativeState, ["source_tag", "sourceTag"])
          ?? readString(publisherNativeRenders, ["source_tag", "sourceTag"]),
        mode: readString(publisherNativeState, ["mode"]) ?? readString(publisherNativeRenders, ["mode"]),
        state: readString(publisherNativeState, ["state", "status"]) ?? "UNKNOWN",
        global_alert: readBoolean(publisherNativeState, ["global_alert", "globalAlert"])
          ?? readBoolean(publisherNativeRenders, ["global_alert", "globalAlert"]),
        outputDir: readString(publisherNativeState, ["output_dir", "outputDir"]) ?? readString(publisherNativeRenders, ["output_dir", "outputDir"]),
        counts: {
          renders: publisherNativeRendersCount,
          archived: readNumber(publisherNativeCounts, ["archived"]),
          orphan: readNumber(publisherNativeCounts, ["orphan"]),
          nonArchived: readNumber(publisherNativeCounts, ["non_archived", "nonArchived"]),
          goldProved: readNumber(publisherNativeCounts, ["gold_proved", "goldProved"]),
          unproven: readNumber(publisherNativeCounts, ["unproven"]),
        },
        batch: publisherNativeBatch,
        workorders: publisherNativeWorkorders,
        qualityTruth: {
          falseGreenPatched: readBoolean(publisherNativeQuality, ["false_green_patched", "falseGreenPatched"]),
          goldenCandidateScore: readNumber(publisherNativeQuality, ["golden_candidate_score", "goldenCandidateScore"]),
          goldenCandidateStatus: readString(publisherNativeQuality, ["golden_candidate_status", "goldenCandidateStatus"]),
        },
        publishLock: {
          allowed: readBoolean(publisherNativePublishLock, ["allowed"]),
          reason: readString(publisherNativePublishLock, ["reason"]),
        },
        tiers: {
          ok: publisherNativeTiersResult.ok,
          sourceTag: readString(publisherNativeTiers, ["source_tag", "sourceTag"]),
          localFirst: readBoolean(publisherNativeTiers, ["local_first", "localFirst"]),
          secretValuesRead: readBoolean(publisherNativeTiers, ["secret_values_read", "secretValuesRead"]),
          plans: toRecord(publisherNativeTiers.plans),
        },
      },
      publisherBridge: {
        ok: publisherAssetBridgeResult.ok && readBoolean(publisherAssetBridge, ["ok"]) === true,
        status: readString(publisherAssetBridge, ["status"]) ?? "UNKNOWN",
        sourceTag: readString(publisherAssetBridge, ["source_tag", "sourceTag"]),
        endpoint: readString(publisherAssetBridge, ["endpoint"]) ?? endpoints.publisherAssetBridge,
        clientScriptUrl: readString(publisherAssetBridge, ["client_script_url", "clientScriptUrl"]) ?? `${HOST}:8540/api/publisher/hub-bridge/client.js`,
        exportedAssetCount: readNumber(publisherAssetBridge, ["exported_asset_count", "exportedAssetCount"]),
        fullAssetCount: readNumber(publisherAssetBridge, ["full_asset_count", "fullAssetCount"]),
        rawFileCandidates: readNumber(publisherAssetBridge, ["raw_file_candidates", "rawFileCandidates"]),
        sha256IndexCount: readNumber(publisherAssetBridge, ["sha256_index_count", "sha256IndexCount"]),
        physicalDuplicateCount: readNumber(publisherAssetBridge, ["physical_duplicate_count", "physicalDuplicateCount"]),
        rootCount: readNumber(publisherAssetBridge, ["root_count", "rootCount"]),
        accessErrorCount: readNumber(publisherAssetBridge, ["access_error_count", "accessErrorCount"]),
        bridgeContract: readString(publisherAssetBridge, ["bridge_contract", "bridgeContract"]),
        sampleAssets: Array.isArray(publisherAssetBridge.assets) ? publisherAssetBridge.assets.slice(0, 12) : [],
      },
      videoAvailability: {
        ok: publisherVideoBridgeResult.ok && readBoolean(publisherVideoBridge, ["ok"]) === true,
        status: readString(publisherVideoBridge, ["status"]) ?? "UNKNOWN",
        sourceTag: readString(publisherVideoBridge, ["source_tag", "sourceTag"]),
        outputDir: readString(publisherVideoBridge, ["output_dir", "outputDir"]),
        scannedCount: readNumber(publisherVideoBridge, ["scanned_count", "scannedCount"]),
        motionProofCount: readNumber(publisherVideoBridge, ["motion_proof_count", "motionProofCount"]),
        latest: toRecord(publisherVideoBridge.latest),
        latestMotionProof: toRecord(publisherVideoBridge.latest_motion_proof),
        items: Array.isArray(publisherVideoBridge.items) ? publisherVideoBridge.items.slice(0, 24) : [],
      },
      publisherCanon,
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
