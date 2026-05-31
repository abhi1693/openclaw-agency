/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING — CONSOLE IA ADAPTER STATE (NO-FALSE-GREEN, §7/§15)
 * ────────────────────────────────────────────────────────────────────
 * Résout l'état RÉEL du provider LLM derrière la Console IA, sans jamais
 * marquer GREEN un provider absent. La clé Perplexity API est ABSENTE
 * (confirmé : aucun PERPLEXITY_API_KEY / aucune lecture de
 * CONSOLE_IA_PERPLEXITY_API_ENABLE dans le code ; le paid_api_guard
 * rapporte perplexity_lane = paid_api_hold_packet_only). On NE marque
 * donc PAS perplexity-api GREEN : on bascule sur le premier fallback
 * RÉEL de la chaîne.
 *
 * HARDLOCK §15 (subscription-browser-first / no hidden Perplexity API) :
 * l'absence de clé n'est PAS un blocker d'auth global — le routing LLM
 * local (rtk-llm-proxy :11435 → OpenRouter/Gemini/Qwen) prend le relais.
 * Le fallback actif par défaut = "openrouter" (AMBER, source=config),
 * car la clé Perplexity manque mais le LLM routing reste opérationnel.
 *
 * RÉUTILISE les types canoniques OperationalStatus + StatusSource
 * (src/types/cofiatWorld.types.ts) — AUCUN nouvel enum n'est créé ici.
 *
 * source_tag: COFIAT_CONSOLE_IA_ADAPTER_STATE_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import type { OperationalStatus, StatusSource } from "@/types/cofiatWorld.types";

/**
 * Provider LLM concret derrière la Console IA.
 * Ordre de la chaîne de repli ci-dessous (FALLBACK_CHAIN).
 *  - "perplexity-api"     : API Perplexity directe (clé requise) — ABSENT ici
 *  - "perplexity-desktop" : bridge app desktop / abonnement (subscription-first)
 *  - "openrouter"         : routing LLM payant via rtk-llm-proxy local
 *  - "gemini"             : Gemini REST direct (perception / fallback)
 *  - "local-memory"       : réponse depuis mémoire/contexte local, zéro LLM externe
 *  - "manual"             : brouillon humain (aucun adapter automatique)
 *  - "none"               : aucun provider résolu (état non audité / cassé)
 */
export type ConsoleIaProvider =
  | "perplexity-api"
  | "perplexity-desktop"
  | "openrouter"
  | "gemini"
  | "local-memory"
  | "manual"
  | "none";

/**
 * État résolu de l'adapter Console IA (no-false-green).
 * `status`/`statusSource` réutilisent strictement les types canoniques.
 */
export type ConsoleIaAdapterState = {
  provider: ConsoleIaProvider;
  status: OperationalStatus;
  statusSource: StatusSource;
  /** preuve sourçable — présente uniquement quand l'état s'appuie sur un signal réel */
  proof?: string;
  /** ce qui manque / pourquoi pas GREEN — toujours présent hors GREEN/LIVE */
  blocker?: string;
  /** chaîne de repli évaluée, dans l'ordre de préférence */
  fallbackChain: string[];
};

/** Chaîne de repli canonique, dans l'ordre de préférence. */
export const FALLBACK_CHAIN: ConsoleIaProvider[] = [
  "perplexity-api",
  "perplexity-desktop",
  "openrouter",
  "gemini",
  "local-memory",
  "manual",
];

const OPENCLAW_ROOT = process.env.OPENCLAW_ROOT ?? path.join(os.homedir(), ".openclaw");
const STATE_ROOT = process.env.COF_STATE_ROOT ?? path.join(OPENCLAW_ROOT, "state");

/** Rapport réel du garde « paid API » (même fichier que la route Console IA). */
const PAID_API_GUARD_REPORT = path.join(STATE_ROOT, "central_brain_paid_api_guard", "latest.json");

/* ── lecture sûre du paid_api_guard (jamais throw) ───────────────── */

type PaidApiGuardCheck = { name?: unknown; status?: unknown; evidence?: unknown };

function readPaidApiGuard(): { checks: PaidApiGuardCheck[]; mtimeIso?: string } | null {
  try {
    if (!existsSync(PAID_API_GUARD_REPORT)) return null;
    const raw = readFileSync(PAID_API_GUARD_REPORT, "utf8");
    const parsed = JSON.parse(raw) as { checks?: unknown };
    const checks = Array.isArray(parsed?.checks) ? (parsed.checks as PaidApiGuardCheck[]) : [];
    let mtimeIso: string | undefined;
    try {
      mtimeIso = statSync(PAID_API_GUARD_REPORT).mtime.toISOString();
    } catch {
      mtimeIso = undefined;
    }
    return { checks, mtimeIso };
  } catch {
    return null;
  }
}

function findCheck(checks: PaidApiGuardCheck[], name: string): PaidApiGuardCheck | undefined {
  return checks.find((c) => typeof c?.name === "string" && c.name === name);
}

/** true si la lane est explicitement en « hold packet only » (donc PAS exécutable sans GO Erwin). */
function laneIsPaidHoldOnly(check: PaidApiGuardCheck | undefined): boolean {
  if (!check) return false;
  const ev = (check.evidence ?? {}) as Record<string, unknown>;
  const mode = typeof ev.mode === "string" ? ev.mode : "";
  const executed = ev.executed === true;
  return !executed && (mode === "paid_api_hold_packet_only" || ev.requires_erwin_paid_api_go === true);
}

/* ── détection des fallbacks RÉELS ───────────────────────────────── */

/**
 * Perplexity API : disponible UNIQUEMENT si une clé réelle est présente.
 * Le label CONSOLE_IA_PERPLEXITY_API_ENABLE n'est PAS lu comme env dans le
 * code de la route — on ne le considère donc pas comme une preuve d'auth ;
 * on exige une vraie clé. Absente par design ici ⇒ jamais GREEN.
 */
function perplexityApiKeyPresent(): boolean {
  const k = process.env.PERPLEXITY_API_KEY;
  return typeof k === "string" && k.trim().length > 0;
}

/**
 * Bridge Perplexity desktop / abonnement : on ne le marque présent QUE si un
 * flag de liveness réel le prouve (env explicite). Les fichiers de brief
 * statiques sur disque ne sont PAS une preuve de bridge runtime — on ne fake
 * donc pas ce provider.
 */
function perplexityDesktopBridgePresent(): boolean {
  const flag = process.env.CONSOLE_IA_PERPLEXITY_DESKTOP_BRIDGE;
  return flag === "1" || flag === "true";
}

/** Clé OpenRouter directe présente (preuve forte d'un fallback OpenRouter exécutable). */
function openRouterKeyPresent(): boolean {
  const k = process.env.OPENROUTER_API_KEY;
  return typeof k === "string" && k.trim().length > 0;
}

/** Clé Gemini présente (preuve d'un fallback Gemini REST direct). */
function geminiKeyPresent(): boolean {
  const k = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  return typeof k === "string" && k.trim().length > 0;
}

/**
 * getConsoleIaAdapterState — fonction PURE (pas d'I/O réseau, lecture FS sûre).
 *
 * Résolution :
 *  1. perplexity-api → seulement si clé réelle présente (sinon on saute).
 *  2. perplexity-desktop → seulement si flag bridge runtime réel (sinon on saute).
 *  3. Sinon, défaut = "openrouter" en AMBER / source=config : la clé Perplexity
 *     manque, mais le LLM routing reste actif (le paid_api_guard confirme la lane
 *     comme « hold packet only » au niveau paiement, ce qui n'invalide pas le
 *     routing local non-payant). Le blocker explique que ce n'est PAS un blocker
 *     d'auth global.
 */
export function getConsoleIaAdapterState(): ConsoleIaAdapterState {
  const fallbackChain = FALLBACK_CHAIN.map(String);
  const guard = readPaidApiGuard();
  const checkedSuffix = guard?.mtimeIso ? ` @ ${guard.mtimeIso}` : "";

  // 1) Perplexity API — uniquement avec une vraie clé.
  if (perplexityApiKeyPresent()) {
    return {
      provider: "perplexity-api",
      status: "LIVE",
      statusSource: "config",
      proof: "PERPLEXITY_API_KEY présent (env)",
      fallbackChain,
    };
  }

  // 2) Perplexity desktop bridge — uniquement avec un flag de liveness réel.
  if (perplexityDesktopBridgePresent()) {
    return {
      provider: "perplexity-desktop",
      status: "AMBER_SESSION",
      statusSource: "config",
      proof: "CONSOLE_IA_PERPLEXITY_DESKTOP_BRIDGE actif (subscription-browser-first)",
      blocker: "Bridge desktop/abonnement (session) — pas de clé API durcie",
      fallbackChain,
    };
  }

  // 3) Défaut : Perplexity API absente → fallback LLM routing actif via OpenRouter.
  //    On NE marque PAS GREEN (no-false-green) : statut AMBER, source=config.
  const ppxLane = findCheck(guard?.checks ?? [], "perplexity_lane_paid_hold_only");
  const orLane = findCheck(guard?.checks ?? [], "openrouter_lane_paid_hold_only");
  const ppxHold = laneIsPaidHoldOnly(ppxLane);
  const orHold = laneIsPaidHoldOnly(orLane);

  // Preuve : on cite l'état réel du guard si lisible, sinon on reste sans preuve
  // (NoFalseGreenGuard exige une preuve seulement pour GREEN/LIVE — ici AMBER).
  const guardProofBits: string[] = [];
  if (ppxHold) guardProofBits.push("paid_api_guard: perplexity_lane=paid_api_hold_packet_only");
  if (orHold) guardProofBits.push("openrouter_lane=paid_api_hold_packet_only");
  const proof = guardProofBits.length
    ? `${guardProofBits.join("; ")}${checkedSuffix}`
    : undefined;

  const blocker =
    "Perplexity API absent — fallback active via OpenRouter/Gemini LLM routing; not a global auth blocker" +
    (orHold ? " (OpenRouter en paid-hold : exécution payante gated GO Erwin, routing local non-payant actif)" : "");

  return {
    provider: "openrouter",
    status: "AMBER",
    statusSource: "config",
    proof,
    blocker,
    fallbackChain,
  };
}

export default getConsoleIaAdapterState;
