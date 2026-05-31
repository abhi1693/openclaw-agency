/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING — Dispatch fin des abonnements → maison canonique.
 * Fonction PURE testable. Classe un abonnement vers SA vraie maison
 * d'après son nom/fonction (au lieu d'un bloc "subscription → iron_office").
 * Ordre des règles = spécifique → générique (évite les collisions, ex.
 * "TradingView Premium" → trading AVANT la règle revenue "premium").
 * source_tag: COFIAT_SUBSCRIPTION_HOUSE_V1
 * ════════════════════════════════════════════════════════════════ */

/** Maison par défaut si aucune règle ne matche (abonnement non classé). */
export const SUBSCRIPTION_DEFAULT_HOUSE = "iron_office";

/**
 * classifySubscriptionHouse — nom d'abonnement → houseId canonique.
 * Déterministe, sans effet de bord. Les règles sont évaluées dans l'ordre.
 */
export function classifySubscriptionHouse(name: string): string {
  const n = (name || "").toLowerCase();

  // 1) Trading & data marché
  if (/apex|databento|tradingview|beeks|bookmap|atas|trader funding/.test(n)) return "mt4_signal_tower";
  // 2) IA / LLM / agents-tooling
  if (/anthropic|claude|openrouter|perplexity|chatgpt|openai|codex|notebooklm|gemini|wispr/.test(n)) return "central_brain";
  // 3) Design / création visuelle
  if (/adobe|canva|figma|elevenlabs/.test(n)) return "assets_warehouse";
  // 4) Production vidéo
  if (/heygen|remotion|capcut|tiktok live|youtube/.test(n)) return "youtube_studio";
  // 5) Connaissance / docs / notes / stockage
  if (/notion|obsidian|google workspace|icloud|\bdrive\b/.test(n)) return "obsidian_library";
  // 6) Task / backlog / projet
  if (/linear/.test(n)) return "paperclip_factory";
  // 7) Dev / web / repos / deploy / monitoring / domaine
  if (/github|vercel|supabase|cloudflare|sentry|hostinger|domaine|cofiatrading\.com/.test(n)) return "site_seo_lab";
  // 8) Runtime / automation / infra / terminal
  if (/docker|warp|openclaw|n8n/.test(n)) return "openclaw_agent_barracks";
  // 9) Social / community
  if (/twitter|\bx premium\b|instagram|tiktok|telegram|meta ads|facebook/.test(n)) return "vip_gate";
  // 10) Revenue tiers / email transactionnel
  if (/\bvip\b|premium|elite|resend|€/.test(n)) return "iron_office";

  return SUBSCRIPTION_DEFAULT_HOUSE;
}
