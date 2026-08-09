import { readFile, stat } from "node:fs/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOME = "/Users/burakokyay";
const SOURCE_TAG = "COFIAT_HUB_SOURCE_LEDGER_LOCAL";
const INVENTORY_130_JSON = `${HOME}/cof-trading/docs/director/proofs/130_total_assets_tools_owned_inventory.json`;
const ASSETS_CANON_JSON = `${HOME}/.openclaw/config/assets_inventory_canon.json`;
const RUNTIME_INVENTORY_JSON = `${HOME}/.openclaw/state/INVENTORY/inventory.json`;
const ASSET_VAULT_JSON = `${HOME}/.openclaw/state/mission_control/asset_vault.json`;

type HubLedgerKind =
  | "truth_source"
  | "patrimoine_entry"
  | "canon_asset"
  | "runtime_section"
  | "asset_vault_root"
  | "asset_vault_asset";

type HubLedgerEntry = {
  id: string;
  name: string;
  kind: HubLedgerKind;
  category: string;
  houseId: string;
  ownerAgentId?: string;
  status: string;
  ok: boolean;
  connected: boolean;
  proofed: boolean;
  proof: string;
  sourceTag: string;
  sourcePath: string;
  blocker?: string;
  nextAction?: string;
  monthlyCostEur?: number | null;
  coveredCount?: number;
};

type BuildStats = {
  falseGreenDowngrades: number;
  warnings: string[];
};

const VALID_HOUSES = new Set([
  "obsidian_library",
  "lightrag_observatory",
  "paperclip_factory",
  "mt4_signal_tower",
  "trading_academy",
  "central_brain",
  "mission_control_tower",
  "openclaw_agent_barracks",
  "youtube_studio",
  "assets_warehouse",
  "site_seo_lab",
  "iron_office",
  "vip_gate",
  "compliance_port",
  "calendar_tower",
  "notebook_alm",
  "proof_ledger",
]);

const HOUSE_ALIAS: Record<string, string> = {
  erwin_perso_ceo: "mission_control_tower",
  control_tower: "mission_control_tower",
  command_tower: "mission_control_tower",
  knowledge_vault: "obsidian_library",
};

const CATEGORY_TO_HOUSE: Record<string, string> = {
  "1. Mission Control / OpenClaw": "mission_control_tower",
  "2. Repos GitHub": "site_seo_lab",
  "3. Frontends / backends / hubs": "mission_control_tower",
  "4. Services locaux / ports": "openclaw_agent_barracks",
  "5. Outils IA": "central_brain",
  "6. Outils dev / code": "site_seo_lab",
  "7. Outils trading": "mt4_signal_tower",
  "8. Brokers / affiliation": "vip_gate",
  "9. Outils revenue / paiement": "iron_office",
  "12. Reseaux sociaux": "vip_gate",
  "12. Réseaux sociaux": "vip_gate",
  "13. Production video / IA video": "youtube_studio",
  "13. Production vidéo / IA vidéo": "youtube_studio",
  "15. Assets medias": "assets_warehouse",
  "15. Assets médias": "assets_warehouse",
  "16. MP4": "assets_warehouse",
  "17. Captions / scripts": "assets_warehouse",
  "18. Documents / vision / plans": "obsidian_library",
  "19. Obsidian / Notion / Linear / Drive": "obsidian_library",
  "20. Automations / n8n / LaunchAgents": "openclaw_agent_barracks",
  "22. Agents / operators": "openclaw_agent_barracks",
  "24. Funnels clients": "iron_office",
  "25. Parcours business": "iron_office",
  "26. Abonnements payants": "iron_office",
  "27. Comptes externes": "mission_control_tower",
  "28. Secrets / credentials": "compliance_port",
  "29. Archives / doublons": "central_brain",
};

const KIND_LABEL: Record<HubLedgerKind, string> = {
  truth_source: "Source live",
  patrimoine_entry: "Patrimoine 130",
  canon_asset: "Asset canon",
  runtime_section: "Inventaire runtime",
  asset_vault_root: "Asset Vault root",
  asset_vault_asset: "Asset Vault asset",
};

const rec = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];

const str = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  const out = String(value).trim();
  return out.length ? out : undefined;
};

const num = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const slug = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "item";

function makeIdFactory() {
  const seen = new Map<string, number>();
  return (prefix: string, raw: string): string => {
    const base = `${prefix}:${slug(raw)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function fileMtimeUtc(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return undefined;
  }
}

function ageSecFromIso(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 1000));
}

const proofLooksUsable = (value?: string | null): boolean => {
  const text = (value ?? "").trim();
  return Boolean(text)
    && !/fallback|indisponible|unavailable|source missing|source down|read unavailable|no listener|timeout|non branche|non branché|missing\/down|pas de preuve|not_scanned/i.test(text);
};

function normalizeStatus(value: unknown, ok?: boolean): string {
  const upper = String(value ?? "").trim().toUpperCase();
  if (!upper) return ok === true ? "LIVE" : "UNKNOWN";
  if (upper === "UP" || upper === "OK" || upper === "GREEN" || upper === "READY" || upper === "LOCAL_READY") return "GREEN";
  if (upper === "LIVE" || upper === "LIVE_OK" || upper === "LIVE_CACHE" || upper === "LIVE_LOCAL") return "LIVE";
  if (upper === "GRAY") return "UNKNOWN";
  if (upper.includes("ARCHIVE") || upper.includes("QUARANTINE")) return "QUARANTINE";
  if (upper.includes("RED") || upper.includes("BROKEN") || upper.includes("DOWN") || upper.includes("ERR")) return "RED";
  if (upper.includes("REVERIFY")) return "AMBER_REVERIFY";
  if (upper.includes("AMBER") || upper.includes("PARTIAL") || upper.includes("STALE") || upper.includes("DEGRADED") || upper.includes("MISSING")) return "AMBER";
  return ok === true ? "LIVE" : "UNKNOWN";
}

const statusIsGreen = (status: string): boolean => status === "GREEN" || status === "LIVE";

const statusBucket = (status: string): "green" | "amber" | "red" | "unknown" => {
  if (status === "GREEN" || status === "LIVE") return "green";
  if (status === "RED" || status === "QUARANTINE") return "red";
  if (status.includes("AMBER") || status === "STALE" || status === "DEGRADED") return "amber";
  return "unknown";
};

function inferHouseFromText(value: string, category?: string): string {
  const hay = `${value} ${category ?? ""}`.toLowerCase();
  if (/calendar|agenda|schedule|recurring|cadence/.test(hay)) return "calendar_tower";
  if (/notebooklm|notebook alm|grounding/.test(hay)) return "notebook_alm";
  if (/proof|ledger|evidence|no-false-green|audit/.test(hay)) return "proof_ledger";
  if (/n8n|paperclip|linear|backlog|issue|ticket|task/.test(hay)) return "paperclip_factory";
  if (/notion|obsidian|vault|drive|docs|sheets|slides|knowledge|canon/.test(hay)) return "obsidian_library";
  if (/telegram|vip|community|broadcast|whatsapp|channel/.test(hay)) return "vip_gate";
  if (/perplexity|lightrag|graph|semantic|radar|research/.test(hay)) return "lightrag_observatory";
  if (/github|repo|openclaw|mission control|command|hub|frontend|backend|port|launchagent/.test(hay)) return "mission_control_tower";
  if (/lobster|runtime|agent|mcp|docker|gateway|heartbeat|launchctl|cron/.test(hay)) return "openclaw_agent_barracks";
  if (/youtube|video|publisher|render|voice|caption|script|studio/.test(hay)) return "youtube_studio";
  if (/asset|media|warehouse|imagen|ideogram|veo|hedra|gallery/.test(hay)) return "assets_warehouse";
  if (/site|seo|landing|vercel|search console|ga4|analytics/.test(hay)) return "site_seo_lab";
  if (/stripe|mrr|arr|revenue|crm|client|payment|subscription|funnel|broker|affiliate/.test(hay)) return "iron_office";
  if (/trading|mt4|market|strat|rithmic|fxcess|databento|broker/.test(hay)) return "mt4_signal_tower";
  if (/compliance|cnmv|aepd|esma|legal|secret|credential|risk|dlp/.test(hay)) return "compliance_port";
  if (/academy|course|module|education/.test(hay)) return "trading_academy";
  return "central_brain";
}

function resolveHouseId(rawHouse: unknown, category: string, text: string): string {
  const candidates = (str(rawHouse) ?? "")
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    const normalized = HOUSE_ALIAS[candidate] ?? candidate;
    if (VALID_HOUSES.has(normalized)) return normalized;
  }
  const byCategory = CATEGORY_TO_HOUSE[category];
  if (byCategory && VALID_HOUSES.has(byCategory)) return byCategory;
  return inferHouseFromText(text, category);
}

const monthlyCostFromText = (value?: string): number | null => {
  const text = value ?? "";
  const match = text.match(/(?:€|eur\s*)\s*(\d+(?:[.,]\d+)?)/i) ?? text.match(/(\d+(?:[.,]\d+)?)\s*(?:€|eur)\s*\/\s*(?:mo|month|mois)/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

function buildEntry(input: Omit<HubLedgerEntry, "ok" | "connected" | "proofed">, stats: BuildStats): HubLedgerEntry {
  const proofed = proofLooksUsable(input.proof);
  const connected = VALID_HOUSES.has(input.houseId);
  let status = normalizeStatus(input.status);
  if (statusIsGreen(status) && !proofed) {
    status = "AMBER_REVERIFY";
    stats.falseGreenDowngrades += 1;
  }
  return {
    ...input,
    status,
    ok: statusIsGreen(status) && proofed,
    connected,
    proofed,
  };
}

async function fetchTruthMap(request: Request | undefined, stats: BuildStats): Promise<Record<string, unknown> | null> {
  if (!request) {
    stats.warnings.push("truth_map_fetch_skipped_no_request");
    return null;
  }
  const origin = new URL(request.url).origin;
  try {
    const response = await fetch(`${origin}/api/cofiatrading-world-control/truth-map?sourceLedger=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) {
      stats.warnings.push(`truth_map_fetch_http_${response.status}`);
      return null;
    }
    return rec(await response.json());
  } catch {
    stats.warnings.push("truth_map_fetch_failed");
    return null;
  }
}

function runtimeSectionProof(
  name: string,
  value: Record<string, unknown>,
  generatedAt: string | undefined,
  runtimeFreshness: string,
  runtimeAgeSec: number | null,
): { status: string; proof: string; houseId: string } {
  const freshnessProof = `generated=${generatedAt ?? "unknown"} · freshness=${runtimeFreshness} · age_sec=${runtimeAgeSec ?? "unknown"}`;
  const gatedStatus = (candidate: string): string =>
    runtimeFreshness === "FRESH" ? candidate : statusIsGreen(normalizeStatus(candidate)) ? "AMBER_REVERIFY" : candidate;

  if (name === "disk" && str(value["_mode"])?.includes("skipped")) {
    return {
      status: "AMBER_REVERIFY",
      proof: `${RUNTIME_INVENTORY_JSON} · disk heavy probe disabled on demand · ${str(value["_reason"]) ?? "manual refresh required"} · ${freshnessProof}`,
      houseId: "assets_warehouse",
    };
  }
  if (name === "cron") {
    return {
      status: gatedStatus((num(value.total) ?? 0) > 0 ? "GREEN" : "UNKNOWN"),
      proof: `${num(value.total) ?? 0} cron(s) · ${freshnessProof}`,
      houseId: "calendar_tower",
    };
  }
  if (name === "openclaw_config") {
    return {
      status: gatedStatus((num(value.agents_configured) ?? 0) > 0 ? "GREEN" : "UNKNOWN"),
      proof: `${num(value.agents_configured) ?? 0} agents configures · plugins=${records(value.plugins_enabled).length || "list"} · ${freshnessProof}`,
      houseId: "openclaw_agent_barracks",
    };
  }
  if (name === "mcp_servers") {
    return {
      status: gatedStatus((num(value.local_count) ?? 0) > 0 ? "GREEN" : "UNKNOWN"),
      proof: `${num(value.local_count) ?? 0} MCP local servers · ${freshnessProof}`,
      houseId: "central_brain",
    };
  }
  if (name === "docker") {
    const unhealthy = num(value.unhealthy) ?? 0;
    const running = num(value.running) ?? 0;
    return {
      status: gatedStatus(unhealthy > 0 ? "AMBER" : running > 0 ? "GREEN" : "UNKNOWN"),
      proof: `docker running=${running} unhealthy=${unhealthy} · ${freshnessProof}`,
      houseId: "openclaw_agent_barracks",
    };
  }
  if (name === "launchctl") {
    const up = num(value.up) ?? 0;
    const down = num(value.down) ?? 0;
    return {
      status: gatedStatus(down > 0 ? "AMBER" : up > 0 ? "GREEN" : "UNKNOWN"),
      proof: `launchctl up=${up} down=${down} total=${num(value.total) ?? "?"} · ${freshnessProof}`,
      houseId: "openclaw_agent_barracks",
    };
  }
  return {
    status: gatedStatus(Object.keys(value).length > 0 ? "GREEN" : "UNKNOWN"),
    proof: `${RUNTIME_INVENTORY_JSON} · section=${name} · ${freshnessProof}`,
    houseId: inferHouseFromText(name),
  };
}

export async function buildSourceLedgerPayload(request?: Request) {
  const stats: BuildStats = { falseGreenDowngrades: 0, warnings: [] };
  const makeId = makeIdFactory();
  const items: HubLedgerEntry[] = [];

  const [truthMap, inventory130Raw, assetsCanonRaw, runtimeRaw, assetVaultRaw] = await Promise.all([
    fetchTruthMap(request, stats),
    readJson(INVENTORY_130_JSON),
    readJson(ASSETS_CANON_JSON),
    readJson(RUNTIME_INVENTORY_JSON),
    readJson(ASSET_VAULT_JSON),
  ]);

  const truthSourceTag = str(truthMap?.sourceTag) ?? "COFIAT_TRUTH_MAP_LOCAL";
  for (const [fallbackHouseId, list] of Object.entries(rec(truthMap?.houses))) {
    for (const source of records(list)) {
      const name = str(source.label) ?? str(source.id) ?? "truth source";
      const sourceStatus = normalizeStatus(source.status, source.ok === true);
      const houseId = resolveHouseId(str(source.houseId) ?? fallbackHouseId, "Source live", name);
      items.push(buildEntry({
        id: makeId("truth", str(source.id) ?? name),
        name,
        kind: "truth_source",
        category: "Source live",
        houseId,
        ownerAgentId: undefined,
        status: sourceStatus,
        proof: str(source.proof) ?? "truth-map sans preuve exploitable",
        sourceTag: str(source.sourceTag) ?? truthSourceTag,
        sourcePath: "/api/cofiatrading-world-control/truth-map",
        blocker: sourceStatus === "LIVE" ? undefined : "source live non verte",
        nextAction: sourceStatus === "LIVE" ? undefined : "re-probe source live",
      }, stats));
    }
  }

  const inventory130 = rec(inventory130Raw);
  const inventoryEntries = records(inventory130.entries);
  const inventorySourceTag = str(inventory130.source_tag) ?? "COFIAT_TOTAL_ASSETS_TOOLS_130";
  const verdictToStatus: Record<string, string> = { GREEN: "GREEN", AMBER: "AMBER", GRAY: "UNKNOWN", RED: "RED", ARCHIVE_CANDIDATE: "QUARANTINE" };
  for (const entry of inventoryEntries) {
    const name = str(entry.nom) ?? "patrimoine item";
    const category = str(entry["catégorie"]) ?? "Patrimoine";
    const houseId = resolveHouseId(entry["maison responsable"], category, `${name} ${str(entry["Mission Control"]) ?? ""}`);
    const verdict = str(entry.verdict)?.toUpperCase() ?? "UNKNOWN";
    const cost = str(entry["coût mensuel"]);
    items.push(buildEntry({
      id: makeId("patrimoine", name),
      name,
      kind: "patrimoine_entry",
      category,
      houseId,
      ownerAgentId: str(entry.owner),
      status: verdictToStatus[verdict] ?? "UNKNOWN",
      proof: str(entry.preuve) ?? `${INVENTORY_130_JSON} · entry present`,
      sourceTag: inventorySourceTag,
      sourcePath: INVENTORY_130_JSON,
      blocker: str(entry.blocker),
      nextAction: str(entry["next action"]),
      monthlyCostEur: monthlyCostFromText(cost),
    }, stats));
  }

  const assetsCanon = rec(assetsCanonRaw);
  const canonSourceTag = str(assetsCanon.source_tag) ?? "ASSETS_INVENTORY_CANON";
  const canonAssets = records(assetsCanon.assets);
  for (const asset of canonAssets) {
    const name = str(asset.name) ?? str(asset.id) ?? "canon asset";
    const category = str(asset.category) ?? "asset canon";
    const endpoint = str(asset.path_or_endpoint) ?? str(asset.path);
    const proof = [str(asset.verified_via), endpoint, str(asset.ts)].filter(Boolean).join(" · ");
    const houseId = resolveHouseId(str(asset.house_id), category, `${name} ${endpoint ?? ""}`);
    items.push(buildEntry({
      id: makeId("canon", str(asset.id) ?? name),
      name,
      kind: "canon_asset",
      category,
      houseId,
      status: normalizeStatus(asset.status),
      proof: proof || `${ASSETS_CANON_JSON} · asset present`,
      sourceTag: canonSourceTag,
      sourcePath: ASSETS_CANON_JSON,
      nextAction: str(asset.next_action),
    }, stats));
  }

  const runtimeDoc = rec(runtimeRaw);
  const runtimeSections = rec(runtimeDoc.sections);
  const runtimeMtimeUtc = await fileMtimeUtc(RUNTIME_INVENTORY_JSON);
  const runtimeGeneratedAt = str(runtimeDoc.generated_at_utc) ?? runtimeMtimeUtc;
  const runtimeAgeSec = ageSecFromIso(runtimeGeneratedAt);
  const runtimeFreshness =
    runtimeAgeSec === null ? "NO_TIMESTAMP" :
    runtimeAgeSec > 86_400 ? "STALE" :
    "FRESH";
  if (runtimeFreshness !== "FRESH") {
    stats.warnings.push(`runtime_inventory_${runtimeFreshness.toLowerCase()}_age_sec_${runtimeAgeSec ?? "unknown"}`);
  }
  const runtimeSourceTag = str(runtimeDoc.source_tag) ?? "COF_RUNTIME_INVENTORY";
  for (const [name, section] of Object.entries(runtimeSections)) {
    const sectionRecord = rec(section);
    const detail = runtimeSectionProof(name, sectionRecord, runtimeGeneratedAt, runtimeFreshness, runtimeAgeSec);
    items.push(buildEntry({
      id: makeId("runtime", name),
      name,
      kind: "runtime_section",
      category: "Runtime inventory",
      houseId: detail.houseId,
      status: detail.status,
      proof: detail.proof,
      sourceTag: runtimeSourceTag,
      sourcePath: RUNTIME_INVENTORY_JSON,
      nextAction: detail.status === "AMBER_REVERIFY" ? "wake inventory heavy probe on demand" : undefined,
    }, stats));
  }

  const assetVault = rec(assetVaultRaw);
  const assetVaultSourceTag = str(assetVault.source_tag) ?? "LIVE_LOCAL_COF_ASSET_VAULT_360";
  const vaultSummary = rec(assetVault.summary);
  const assetVaultDeclaredAssets = num(vaultSummary.asset_count) ?? records(assetVault.assets).length;
  const assetVaultRawFiles = num(vaultSummary.raw_file_count) ?? null;
  const vaultRoots = records(assetVault.roots);
  for (const root of vaultRoots) {
    const name = str(root.id) ?? str(root.root) ?? "asset vault root";
    const category = str(root.category) ?? "asset vault root";
    const proof = `${str(root.root) ?? ASSET_VAULT_JSON} · files=${num(root.file_count) ?? "?"} · active=${num(root.active_file_count) ?? "?"} · ${str(root.patch) ?? "asset vault scan"}`;
    const houseId = resolveHouseId(undefined, category, `${name} ${str(root.lane) ?? ""} ${str(root.root) ?? ""}`);
    items.push(buildEntry({
      id: makeId("vault-root", name),
      name,
      kind: "asset_vault_root",
      category,
      houseId,
      ownerAgentId: str(root.owner_agent),
      status: normalizeStatus(root.status),
      proof,
      sourceTag: assetVaultSourceTag,
      sourcePath: ASSET_VAULT_JSON,
      nextAction: str(root.patch),
      coveredCount: num(root.active_file_count) ?? num(root.file_count) ?? undefined,
    }, stats));
  }

  const vaultAssets = records(assetVault.assets);
  for (const asset of vaultAssets) {
    const name = str(asset.title) ?? str(asset.relative_path) ?? str(asset.id) ?? "asset vault asset";
    const category = str(asset.category) ?? str(asset.kind) ?? "asset vault asset";
    const path = str(asset.path) ?? str(asset.relative_path);
    const text = `${name} ${category} ${str(asset.kind) ?? ""} ${str(asset.lane) ?? ""} ${str(asset.root_id) ?? ""} ${path ?? ""}`;
    const proof = [path, str(asset.mtime_utc), str(asset.tooltip)].filter(Boolean).join(" · ");
    items.push(buildEntry({
      id: makeId("vault-asset", str(asset.id) ?? name),
      name,
      kind: "asset_vault_asset",
      category,
      houseId: resolveHouseId(undefined, category, text),
      ownerAgentId: str(asset.owner_agent),
      status: normalizeStatus(asset.status),
      proof: proof || `${ASSET_VAULT_JSON} · asset present`,
      sourceTag: str(asset.source_tag) ?? assetVaultSourceTag,
      sourcePath: ASSET_VAULT_JSON,
      nextAction: str(asset.decision),
    }, stats));
  }

  const countsByStatus: Record<string, number> = {};
  const countsByKind: Record<string, number> = {};
  const byHouse: Record<string, { total: number; connected: number; proofed: number; green: number; amber: number; red: number; unknown: number; kinds: Record<string, number> }> = {};
  const byKind: Record<string, { label: string; total: number; connected: number; proofed: number; green: number; amber: number; red: number; unknown: number }> = {};
  for (const item of items) {
    countsByStatus[item.status] = (countsByStatus[item.status] ?? 0) + 1;
    countsByKind[item.kind] = (countsByKind[item.kind] ?? 0) + 1;
    const bucket = statusBucket(item.status);
    const house = byHouse[item.houseId] ?? { total: 0, connected: 0, proofed: 0, green: 0, amber: 0, red: 0, unknown: 0, kinds: {} };
    house.total += 1;
    house.connected += item.connected ? 1 : 0;
    house.proofed += item.proofed ? 1 : 0;
    house[bucket] += 1;
    house.kinds[item.kind] = (house.kinds[item.kind] ?? 0) + 1;
    byHouse[item.houseId] = house;

    const kind = byKind[item.kind] ?? { label: KIND_LABEL[item.kind], total: 0, connected: 0, proofed: 0, green: 0, amber: 0, red: 0, unknown: 0 };
    kind.total += 1;
    kind.connected += item.connected ? 1 : 0;
    kind.proofed += item.proofed ? 1 : 0;
    kind[bucket] += 1;
    byKind[item.kind] = kind;
  }

  const assetVaultRemainder = Math.max(0, assetVaultDeclaredAssets - vaultAssets.length);
  const rootsCoverVault = vaultRoots.length > 0 && vaultRoots.every((root) => normalizeStatus(root.status) === "GREEN" && proofLooksUsable(str(root.root) ?? str(root.patch)));
  const connectedItems = items.filter((item) => item.connected).length;
  const proofedItems = items.filter((item) => item.proofed).length;
  const declaredCoverageTotal = items.length + assetVaultRemainder;
  const declaredCoverageConnected = connectedItems + (rootsCoverVault ? assetVaultRemainder : 0);
  const declaredCoverageProofed = proofedItems + (rootsCoverVault ? assetVaultRemainder : 0);
  const greenItems = items.filter((item) => statusBucket(item.status) === "green").length;
  const amberItems = items.filter((item) => statusBucket(item.status) === "amber").length;
  const redItems = items.filter((item) => statusBucket(item.status) === "red").length;
  const unknownItems = items.filter((item) => statusBucket(item.status) === "unknown").length;

  const sortedItems = [...items].sort((a, b) => {
    const rank: Record<string, number> = { RED: 0, QUARANTINE: 1, AMBER: 2, AMBER_REVERIFY: 2, UNKNOWN: 3, GREEN: 4, LIVE: 4 };
    return (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
  });

  return {
    ok: true,
    sourceTag: SOURCE_TAG,
    policy: "NO_FALSE_GREEN",
    generatedAtUtc: new Date().toISOString(),
    summary: {
      totalItems: items.length,
      connected: connectedItems,
      proofed: proofedItems,
      green: greenItems,
      amber: amberItems,
      red: redItems,
      unknown: unknownItems,
      falseGreenDowngrades: stats.falseGreenDowngrades,
      declaredCoverageTotal,
      declaredCoverageConnected,
      declaredCoverageProofed,
      assetVaultRemainderCoveredByRoots: rootsCoverVault ? assetVaultRemainder : 0,
    },
    declared: {
      truthSources: records(Object.values(rec(truthMap?.houses)).flat()).length,
      patrimoineEntries: inventoryEntries.length,
      canonAssets: canonAssets.length,
      runtimeSections: Object.keys(runtimeSections).length,
      assetVaultRoots: vaultRoots.length,
      assetVaultAssetsReturned: vaultAssets.length,
      assetVaultAssetsDeclared: assetVaultDeclaredAssets,
      assetVaultRawFiles,
    },
    countsByStatus,
    countsByKind,
    byKind,
    byHouse,
    warnings: stats.warnings,
    sourcePaths: {
      truthMap: "/api/cofiatrading-world-control/truth-map",
      inventory130: INVENTORY_130_JSON,
      assetsCanon: ASSETS_CANON_JSON,
      runtimeInventory: RUNTIME_INVENTORY_JSON,
      assetVault: ASSET_VAULT_JSON,
    },
    items: sortedItems,
  };
}

export async function GET(request: Request) {
  const payload = await buildSourceLedgerPayload(request);
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
