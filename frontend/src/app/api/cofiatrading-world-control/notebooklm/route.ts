/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — API NotebookLM (état LIVE réel)
 * ────────────────────────────────────────────────────────────────────
 * Surface l'état RÉEL de Google NotebookLM (« Notebook KLM ») depuis la
 * source canon `~/.openclaw/state/company_os/notebooklm_packs.json`.
 * NotebookLM a 0 API publique → le hub est un INDEX de fraîcheur/couverture
 * (hub_role = freshness_and_coverage_index_only), pas un proxy d'exécution.
 *
 * NO-FALSE-GREEN : source=filesystem (réelle). On expose la fraîcheur réelle
 * (last_audit_utc) ; si périmé > 7j → statut AMBER_REVERIFY honnête, jamais
 * un GREEN inventé. Lecture seule, zéro secret (le fichier est déjà filtré).
 *
 * source_tag: COFIAT_NOTEBOOKLM_API_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PACKS_PATH = join(homedir(), ".openclaw/state/company_os/notebooklm_packs.json");
const DEEP_LINK = "https://notebooklm.google.com";

type Pack = {
  id: string;
  title: string;
  status: string;
  notebook_url?: string;
  created_at?: string;
};

type NotebookLmState = {
  ok: boolean;
  /** statut opérationnel honnête : LIVE / AMBER_REVERIFY / UNKNOWN */
  status: "LIVE" | "AMBER_REVERIFY" | "UNKNOWN";
  source: "filesystem";
  rawStatus: string | null;
  packsTotal: number;
  packsSynced: number;
  packsAwaiting: number;
  packs: Pack[];
  lastAuditUtc: string | null;
  staleDays: number | null;
  hubRole: string | null;
  automationAllowed: boolean | null;
  deepLink: string;
  proof: string;
  blocker?: string;
  nextAction?: string;
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export async function GET() {
  if (!existsSync(PACKS_PATH)) {
    const miss: NotebookLmState = {
      ok: false,
      status: "UNKNOWN",
      source: "filesystem",
      rawStatus: null,
      packsTotal: 0,
      packsSynced: 0,
      packsAwaiting: 0,
      packs: [],
      lastAuditUtc: null,
      staleDays: null,
      hubRole: null,
      automationAllowed: null,
      deepLink: DEEP_LINK,
      proof: `notebooklm_packs.json absent (${PACKS_PATH})`,
      blocker: "Index NotebookLM introuvable",
      nextAction: "Lancer l'audit packs NotebookLM (cowork/Chrome)",
    };
    return NextResponse.json(miss, { status: 200 });
  }

  try {
    const raw = JSON.parse(readFileSync(PACKS_PATH, "utf8")) as Record<string, unknown>;
    const packsArr = Array.isArray(raw.packs) ? (raw.packs as Record<string, unknown>[]) : [];
    const packs: Pack[] = packsArr.map((p) => ({
      id: String(p.id ?? ""),
      title: String(p.title ?? ""),
      status: String(p.status ?? "unknown"),
      notebook_url: typeof p.notebook_url === "string" ? p.notebook_url : undefined,
      created_at: typeof p.created_at === "string" ? p.created_at : undefined,
    }));

    const packsTotal = typeof raw.packs_total === "number" ? raw.packs_total : packs.length;
    const packsSynced =
      typeof raw.packs_synced === "number"
        ? raw.packs_synced
        : packs.filter((p) => p.status === "created" || p.status === "synced").length;
    const packsAwaiting =
      typeof raw.packs_awaiting_notebook_creation === "number"
        ? raw.packs_awaiting_notebook_creation
        : Math.max(0, packsTotal - packsSynced);

    const lastAuditUtc = typeof raw.last_audit_utc === "string" ? raw.last_audit_utc : null;
    const staleDays = daysSince(lastAuditUtc);
    const policy = (raw.policy ?? {}) as Record<string, unknown>;
    const hubRole = typeof policy.hub_role === "string" ? policy.hub_role : null;
    const automationAllowed =
      typeof policy.automation_allowed === "boolean" ? policy.automation_allowed : null;

    // Statut honnête : périmé > 7j ⇒ AMBER_REVERIFY (jamais GREEN sur des sources vieilles).
    const stale = staleDays !== null && staleDays > 7;
    const status: NotebookLmState["status"] = stale ? "AMBER_REVERIFY" : "LIVE";

    const state: NotebookLmState = {
      ok: true,
      status,
      source: "filesystem",
      rawStatus: typeof raw.status === "string" ? raw.status : null,
      packsTotal,
      packsSynced,
      packsAwaiting,
      packs,
      lastAuditUtc,
      staleDays,
      hubRole,
      automationAllowed,
      deepLink: DEEP_LINK,
      proof: `notebooklm_packs.json — ${packsSynced}/${packsTotal} notebooks, audit ${lastAuditUtc ?? "?"}`,
      ...(stale
        ? {
            blocker: `Sources périmées (${staleDays}j depuis le dernier audit) — re-sync requis`,
            nextAction: "Rafraîchir les sources NotebookLM via Chrome (cowork)",
          }
        : packsAwaiting > 0
        ? {
            blocker: `${packsAwaiting} notebook(s) à créer`,
            nextAction: "Créer les notebooks manquants (Iron CRM / Brokers-VIP / Site)",
          }
        : {}),
    };

    return NextResponse.json(state, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "UNKNOWN" as const,
        source: "filesystem" as const,
        rawStatus: null,
        packsTotal: 0,
        packsSynced: 0,
        packsAwaiting: 0,
        packs: [],
        lastAuditUtc: null,
        staleDays: null,
        hubRole: null,
        automationAllowed: null,
        deepLink: DEEP_LINK,
        proof: `parse error: ${error instanceof Error ? error.message : "unknown"}`,
        blocker: "notebooklm_packs.json illisible",
        nextAction: "Vérifier le JSON de l'index NotebookLM",
      },
      { status: 200 }
    );
  }
}
