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
 * CLIENT-SAFE (NO-FALSE-GREEN strict) : ce module est importé par
 * AuthProviderStatusPanel, lui-même rendu dans WorldControl ("use client").
 * On n'importe donc AUCUN built-in Node (node:fs/os/path) — cela casserait
 * le bundle client (build + runtime navigateur) alors que `tsc` reste vert.
 * La résolution du provider s'appuie uniquement sur process.env (lisible des
 * deux côtés ; côté navigateur, les vars non-NEXT_PUBLIC sont `undefined`,
 * ce qui produit le défaut HONNÊTE openrouter/AMBER — jamais un faux-vert).
 * L'enrichissement optionnel de la preuve via le rapport paid_api_guard sur
 * disque (server-only) est volontairement retiré : il ne peut pas s'exécuter
 * dans le navigateur et n'est requis que pour un statut AMBER (pas GREEN/LIVE).
 *
 * source_tag: COFIAT_CONSOLE_IA_ADAPTER_STATE_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

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
 *     manque, mais le LLM routing reste actif. Le blocker explique que ce n'est
 *     PAS un blocker d'auth global (routing local non-payant via rtk-llm-proxy).
 *
 * CLIENT-SAFE : aucune I/O disque/Node — la résolution lit uniquement
 * process.env (absent côté navigateur ⇒ défaut honnête, jamais faux-vert).
 */
export function getConsoleIaAdapterState(): ConsoleIaAdapterState {
  const fallbackChain = FALLBACK_CHAIN.map(String);

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
  //    AMBER n'exige aucune preuve (NoFalseGreenGuard ne l'impose que pour
  //    GREEN/LIVE) ; on laisse donc `proof` indéfini côté client-safe.
  const blocker =
    "Perplexity API absent — fallback active via OpenRouter/Gemini LLM routing; not a global auth blocker " +
    "(OpenRouter en paid-hold : exécution payante gated GO Erwin, routing local non-payant actif)";

  return {
    provider: "openrouter",
    status: "AMBER",
    statusSource: "config",
    blocker,
    fallbackChain,
  };
}

export default getConsoleIaAdapterState;
