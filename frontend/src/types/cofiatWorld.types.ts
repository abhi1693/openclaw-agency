/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — TYPES CANONIQUES (single source of truth)
 * ────────────────────────────────────────────────────────────────────
 * Ce fichier est l'UNIQUE définition de `StatusSource` + `OperationalStatus`
 * pour tout le World-Control / map / panneau droit / console.IA / auth-ledger.
 *
 * `src/config/cofiatWorldStatus.ts` RÉ-EXPORTE ces deux types depuis ici
 * (pas de définition concurrente) ; il garde uniquement la logique runtime
 * (STATUS_STYLE, guardStatus, houseStatusToCell, boolToCell, …).
 *
 * Règle d'or NO-FALSE-GREEN (§7) inchangée : un GREEN/LIVE n'est jamais
 * affiché sans source réelle (runtime/api/filesystem) ET une preuve.
 *
 * source_tag: COFIAT_WORLD_TYPES_SSOT_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

/**
 * Origine de la donnée d'un statut.
 * Les sources « réelles » (runtime/api/filesystem) sont les seules qui
 * autorisent un GREEN/LIVE (cf. NoFalseGreenGuard dans cofiatWorldStatus.ts).
 * `user_audit` = saisie d'audit humaine traçable (ledger auth/credentials).
 */
export type StatusSource =
  | "runtime"
  | "api"
  | "filesystem"
  | "config"
  | "mock"
  | "user_audit"
  | "unknown";

/**
 * Statut opérationnel canonique — sur-ensemble strict de l'ancienne union
 * de `cofiatWorldStatus.ts` (GREEN/AMBER/RED/UNKNOWN/LOCKED/STALE/QUARANTINE/
 * DRAFT/LIVE), enrichi des cas auth-ledger / provider :
 *   - AMBER_REVERIFY : à re-vérifier (preuve périmée / re-probe attendue)
 *   - AMBER_REPAIR   : dégradé, réparation en cours/attendue
 *   - AMBER_SESSION  : valable seulement via session courante (cookie/bridge), pas durci
 *   - OPTIONAL_MISSING : provider optionnel absent mais NON bloquant (couvert ailleurs)
 *   - OPTIONAL_COVERED : provider optionnel absent MAIS couvert par un fallback réel
 *   - ADAPTER_MISSING  : adapter/clé absent (ex: Perplexity sans clé) — honnête, pas faux-vert
 */
export type OperationalStatus =
  | "GREEN"
  | "LIVE"
  | "AMBER"
  | "AMBER_REVERIFY"
  | "AMBER_REPAIR"
  | "AMBER_SESSION"
  | "RED"
  | "UNKNOWN"
  | "LOCKED"
  | "STALE"
  | "QUARANTINE"
  | "DRAFT"
  | "OPTIONAL_MISSING"
  | "OPTIONAL_COVERED"
  | "ADAPTER_MISSING";

/**
 * Catégorie fonctionnelle d'un credential/provider dans le ledger d'auth.
 * Couvre le stack COFIATRADING (voix, image, vidéo, lipsync, revenue, CRM,
 * broadcast, data, LLM, broker, contenu, design, recherche, ops, infra).
 */
export type AuthLedgerCategory =
  | "voice"
  | "image"
  | "video"
  | "lipsync"
  | "revenue"
  | "crm"
  | "broadcast"
  | "data"
  | "llm"
  | "broker"
  | "content"
  | "design"
  | "search"
  | "ops"
  | "infra";

/**
 * Criticité d'un credential/provider : pilote le tri + le no-false-green.
 * `critical` down ⇒ jamais masqué ; `optional`/`experimental` peuvent rester
 * OPTIONAL_MISSING/OPTIONAL_COVERED sans alarmer.
 */
export type AuthLedgerCriticality =
  | "critical"
  | "important"
  | "optional"
  | "experimental";

/**
 * Ligne du ledger d'authentification / credentials / providers.
 * Un item = un provider (clé/API/abonnement/broker) avec son statut réel,
 * sa source, sa criticité, et (no-false-green) sa preuve / blocker / fallback.
 */
/** Type de preuve (taxonomie canonique no-false-green). */
export type ProofKind =
  | "heartbeat"
  | "api_probe"
  | "auth_probe"
  | "manual_verification"
  | "billing_check"
  | "filesystem_check"
  | "deployment_check";

/** Confiance de la preuve : hard (probe live), soft (dérivé), manual (audit humain). */
export type ProofConfidence = "hard" | "soft" | "manual";

export type AuthLedgerItem = {
  id: string;
  name: string;
  provider: string;
  category: AuthLedgerCategory;
  status: OperationalStatus;
  statusSource: StatusSource;
  criticality: AuthLedgerCriticality;
  /** preuve sourçable — OBLIGATOIRE pour GREEN/LIVE (sinon rétrogradé) */
  proof?: string;
  /** ce qui manque — attendu pour les AMBER, RED, OPTIONAL_* et ADAPTER_MISSING */
  blocker?: string;
  /** ids des providers qui couvrent ce manque (fallback réel) */
  coveredBy?: string[];
  nextAction?: string;
  greenCondition?: string;
  lastCheckedLabel?: string;
};
