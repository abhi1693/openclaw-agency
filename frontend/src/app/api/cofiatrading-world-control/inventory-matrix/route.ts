import { readFile } from "fs/promises";
import type { OperationalStatus, StatusSource } from "@/types/cofiatWorld.types";

/**
 * inventory-matrix — matrice opérationnelle COMPLÈTE inventaire/statut, lue 100% LOCAL
 * server-side (mêmes conventions que ../house-kpis/route.ts : readFile, try/catch gracieux,
 * « fichiers locaux uniquement », export dynamic). Zéro invention : chaque item porte son
 * statut RÉEL issu de sa source + un `statusSource`. Aucun GREEN n'est fabriqué.
 *
 * Sources réelles normalisées en UN seul tableau d'items :
 *   1) docs/director/proofs/130_total_assets_tools_owned_inventory.json  (entries ~647, verdict réel)
 *   2) .openclaw/state/INVENTORY/subscriptions.yaml                       (abonnements payés)
 *   3) .openclaw/config/agents_visual_identity_canon.json                 (38 agents canon)
 *
 * source_tag: COFIAT_INVENTORY_MATRIX_LOCAL
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOME = "/Users/burakokyay";
const INVENTORY_JSON = `${HOME}/cof-trading/docs/director/proofs/130_total_assets_tools_owned_inventory.json`;
const SUBSCRIPTIONS_YAML = `${HOME}/.openclaw/state/INVENTORY/subscriptions.yaml`;
const AGENTS_CANON_JSON = `${HOME}/.openclaw/config/agents_visual_identity_canon.json`;

/** Item normalisé exposé par la matrice (forme alignée AuthLedgerItem, sans champs auth-only). */
type InventoryMatrixItem = {
  id: string;
  name: string;
  category: string;
  ownerAgentId?: string;
  houseId?: string;
  cost?: string;
  status: OperationalStatus;
  statusSource: StatusSource;
  proof?: string;
  blocker?: string;
  coveredBy?: string[];
  nextAction?: string;
  greenCondition?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(path: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

const str = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
};

/** Mapping verdict inventaire (fichier réel) → OperationalStatus canon. */
const VERDICT_TO_STATUS: Record<string, OperationalStatus> = {
  GREEN: "GREEN",
  AMBER: "AMBER",
  GRAY: "UNKNOWN",
  RED: "RED",
  ARCHIVE_CANDIDATE: "QUARANTINE",
};

/** id stable, lisible, dé-dupliqué par compteur. */
function makeIdFactory() {
  const seen = new Map<string, number>();
  return (prefix: string, raw: string): string => {
    const base = `${prefix}:${raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "item"}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

export async function GET() {
  const id = makeIdFactory();
  const items: InventoryMatrixItem[] = [];
  const sourcesRead = { inventory: false, subscriptions: false, agents: false };
  const notes: string[] = [];

  // ── 1) Inventaire 647 assets/tools (verdict RÉEL du fichier) ────────────────
  const inv = await readJson(INVENTORY_JSON);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: any[] = Array.isArray(inv?.entries) ? inv.entries : [];
  if (entries.length > 0) {
    sourcesRead.inventory = true;
    for (const e of entries) {
      if (!e || typeof e !== "object") continue;
      const name = str(e["nom"]) ?? "(sans nom)";
      const verdict = str(e["verdict"])?.toUpperCase() ?? "";
      const status: OperationalStatus = VERDICT_TO_STATUS[verdict] ?? "UNKNOWN";
      items.push({
        id: id("inv", name),
        name,
        category: str(e["catégorie"]) ?? "asset",
        houseId: str(e["maison responsable"]),
        ownerAgentId: str(e["owner"]),
        cost: str(e["coût mensuel"]),
        status,
        statusSource: "filesystem",
        proof: str(e["preuve"]),
        blocker: str(e["blocker"]),
        nextAction: str(e["next action"]),
      });
    }
  } else {
    notes.push("inventory_skipped: 130_total_assets_tools_owned_inventory.json absent ou sans entries");
  }

  // ── 2) Abonnements payés (subscriptions.yaml) ───────────────────────────────
  // present-but-not-retested ⇒ AMBER_REVERIFY (jamais GREEN automatique).
  try {
    const yamlText = await readFile(SUBSCRIPTIONS_YAML, "utf8");
    // Parser YAML réel si installé dans le repo ; sinon note honnête (jamais fake).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let YAML: any = null;
    try {
      // "yaml" (preferred) puis "js-yaml" en fallback.
      YAML = require("yaml");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch {
      try {
        // js-yaml expose load()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jsy: any = require("js-yaml");
        YAML = { parse: (t: string) => jsy.load(t) };
      } catch {
        YAML = null;
      }
    }

    if (YAML) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = YAML.parse(yamlText);
      const SKIP = new Set(["meta"]);
      let count = 0;
      if (doc && typeof doc === "object") {
        for (const section of Object.keys(doc)) {
          if (SKIP.has(section)) continue;
          const list = doc[section];
          if (!Array.isArray(list)) continue;
          for (const sub of list) {
            if (!sub || typeof sub !== "object" || !("name" in sub)) continue;
            // Abonnement PAYÉ = porte un montant numérique réel.
            if (typeof sub.amount !== "number") continue;
            const name = str(sub.name) ?? "(abonnement)";
            const subStatus = String(sub.status ?? "").trim();
            const currency = str(sub.currency) ?? "";
            const costLabel = `${sub.amount}${currency ? " " + currency : ""}`;
            items.push({
              id: id("sub", name),
              name,
              category: "subscription",
              cost: costLabel,
              // actif présent mais non re-testé ⇒ AMBER_REVERIFY, PAS vert.
              status: subStatus === "active" ? "AMBER_REVERIFY" : "UNKNOWN",
              statusSource: "config",
              nextAction: "re-probe abonnement (preuve périmée)",
              greenCondition: "probe live OK ce mois-ci (clé/usage vérifié)",
            });
            count += 1;
          }
        }
      }
      if (count > 0) sourcesRead.subscriptions = true;
      else notes.push("subscriptions_skipped: aucun abonnement payé (amount numérique) trouvé dans le YAML");
    } else {
      notes.push("subscriptions_skipped: no yaml parser");
    }
  } catch {
    notes.push("subscriptions_skipped: subscriptions.yaml absent ou illisible");
  }

  // ── 3) Agents canon (38) — heartbeat freshness non encore lié ⇒ UNKNOWN ─────
  const agentsDoc = await readJson(AGENTS_CANON_JSON);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents: any[] = Array.isArray(agentsDoc?.agents) ? agentsDoc.agents : [];
  if (agents.length > 0) {
    sourcesRead.agents = true;
    for (const a of agents) {
      if (!a || typeof a !== "object") continue;
      const name = str(a.name) ?? str(a.id) ?? "(agent)";
      items.push({
        id: id("agent", str(a.id) ?? name),
        name,
        category: "agent",
        houseId: str(a.house_attached),
        ownerAgentId: str(a.id),
        // pas de preuve de fraîcheur ici ⇒ honnêtement UNKNOWN (no false green).
        status: "UNKNOWN",
        statusSource: "config",
        nextAction: "bind heartbeat freshness",
        greenCondition: "heartbeat agent frais (< seuil) prouvé live",
      });
    }
  } else {
    notes.push("agents_skipped: agents_visual_identity_canon.json absent ou sans agents");
  }

  // ── Agrégats ────────────────────────────────────────────────────────────────
  const counts_by_status: Record<string, number> = {};
  const counts_by_category: Record<string, number> = {};
  for (const it of items) {
    counts_by_status[it.status] = (counts_by_status[it.status] ?? 0) + 1;
    counts_by_category[it.category] = (counts_by_category[it.category] ?? 0) + 1;
  }

  return Response.json({
    ok: true,
    source_tag: "COFIAT_INVENTORY_MATRIX_LOCAL",
    generatedAtLabel: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
    total: items.length,
    counts_by_status,
    counts_by_category,
    sourcesRead,
    ...(notes.length ? { notes } : {}),
    items,
  });
}
