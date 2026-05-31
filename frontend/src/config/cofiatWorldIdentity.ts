/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — Visual Identity Bible + Palette (§11/§12/§14)
 * Données canoniques consommées par la map (bâtiments, avatars, districts).
 * Objectif : reconnaissance SANS label (forme=fonction, couleur=district/rôle,
 * accessoire=métier) + avatars diversifiés (jamais des clones colorés).
 * ════════════════════════════════════════════════════════════════ */

export type DistrictId = "core" | "academy" | "knowledge" | "publishing" | "revenue" | "risk" | "ops" | "alm" | "proof";

/** palette par district (couleur = appartenance, pas information de statut) */
export const districtPalettes: Record<DistrictId, { primary: string; secondary: string; accent: string }> = {
  core:       { primary: "#00d7c7", secondary: "#102c3a", accent: "#8ff7ee" },
  academy:    { primary: "#3ab7ff", secondary: "#12384f", accent: "#aee7ff" },
  knowledge:  { primary: "#8b5cf6", secondary: "#241442", accent: "#d2b8ff" },
  publishing: { primary: "#ec4899", secondary: "#3a1230", accent: "#ffc1e3" },
  revenue:    { primary: "#f5b942", secondary: "#3b2a0a", accent: "#ffe3a0" },
  risk:       { primary: "#ef4444", secondary: "#3b1111", accent: "#ffb4b4" },
  ops:        { primary: "#22c55e", secondary: "#0f2f1b", accent: "#a7f3d0" },
  alm:        { primary: "#f8f1df", secondary: "#2d2440", accent: "#60a5fa" },
  proof:      { primary: "#cbd5e1", secondary: "#111827", accent: "#34d399" },
};

/** carte maison → district (les 15 maisons canon + 2 modules ALM/Proof) */
export const HOUSE_DISTRICT: Record<string, DistrictId> = {
  mt4_signal_tower: "core",
  mission_control_tower: "core",
  central_brain: "knowledge",
  obsidian_library: "knowledge",
  lightrag_observatory: "knowledge",
  trading_academy: "academy",
  youtube_studio: "publishing",
  assets_warehouse: "publishing",
  paperclip_factory: "publishing",
  iron_office: "revenue",
  site_seo_lab: "revenue",
  vip_gate: "revenue",
  compliance_port: "risk",
  openclaw_agent_barracks: "ops",
  calendar_tower: "ops",
  notebook_alm: "alm",
  proof_ledger: "proof",
};

/** méta de reconnaissance par maison (no-label test §5) */
export const HOUSE_META: Record<string, { recognizableName: string; metaphor: string; emblem: string }> = {
  mt4_signal_tower:        { recognizableName: "Trading Tower",          metaphor: "tour de marché / QG financier (chandeliers, antenne signal)", emblem: "candlestick" },
  mission_control_tower:   { recognizableName: "Command Tower",          metaphor: "tour de contrôle (radar, console, beacon)",                  emblem: "radar" },
  trading_academy:         { recognizableName: "Trading Academy",        metaphor: "campus / amphi (fronton à colonnes, drapeau)",               emblem: "graduation" },
  central_brain:           { recognizableName: "Central Brain",          metaphor: "data-center IA (dôme / cœur neural lumineux)",                emblem: "neural-core" },
  obsidian_library:        { recognizableName: "Knowledge Vault",        metaphor: "coffre/bibliothèque blindée (porte vault, sceau)",           emblem: "vault-door" },
  lightrag_observatory:    { recognizableName: "Lighthouse Observatory", metaphor: "observatoire (dôme + télescope/faisceau)",                   emblem: "telescope" },
  youtube_studio:          { recognizableName: "COF IA Publisher",       metaphor: "moteur média IA (écran play, reels, render node)",           emblem: "play-engine" },
  assets_warehouse:        { recognizableName: "Publisher Suite",        metaphor: "studio/entrepôt média (portes, bobine film)",                emblem: "film-reel" },
  paperclip_factory:       { recognizableName: "Paperclip Factory",      metaphor: "usine automation (cheminée, engrenage, trombone)",           emblem: "gear" },
  iron_office:             { recognizableName: "Revenue & CRM",          metaphor: "bloc business gold (pipeline, €, CRM)",                       emblem: "euro" },
  site_seo_lab:            { recognizableName: "Site & SEO Lab",         metaphor: "labo web clair (loupe/search, rack serveur)",                emblem: "search" },
  vip_gate:                { recognizableName: "Telegram Community",      metaphor: "station broadcast (antenne, bulles message)",                emblem: "broadcast" },
  compliance_port:         { recognizableName: "Compliance Gate",        metaphor: "checkpoint/fortification (barrière, bouclier)",              emblem: "shield" },
  calendar_tower:          { recognizableName: "Calendar Tower",         metaphor: "tour planning (horloge, tuiles calendrier)",                 emblem: "calendar" },
  openclaw_agent_barracks: { recognizableName: "Agents Village",         metaphor: "village/dortoir agents (toits multiples, slots)",            emblem: "village" },
  notebook_alm:            { recognizableName: "Notebook ALM",           metaphor: "carnet de pilotage ouvert (onglets, checklist, roadmap)",    emblem: "notebook" },
  proof_ledger:            { recognizableName: "Proof Ledger",           metaphor: "registre/coffre de preuves (sceau, ledger, cadenas)",        emblem: "seal" },
};

/* ════════ Types d'avatars métier (§14) ════════ */
export type AgentAvatarType =
  | "operator" | "trader" | "analyst" | "builder" | "publisher" | "risk" | "knowledge"
  | "system" | "support" | "vipHandler" | "telegramHandler" | "assetManager" | "notebookPlanner" | "proofAuditor";

/** catalogue : type → accessoire métier + tenue + posture + symbole (consommé par l'avatar SVG) */
export const AGENT_TYPE_CATALOG: Record<AgentAvatarType, { accessory: string; outfit: string; posture: string; symbol: string; outfitColor: string }> = {
  operator:        { accessory: "headset",   outfit: "tech-vest",   posture: "console", symbol: "terminal", outfitColor: "#22c55e" },
  trader:          { accessory: "tablet",     outfit: "suit-sharp",  posture: "standing", symbol: "chart",   outfitColor: "#00d7c7" },
  analyst:         { accessory: "datasheet",  outfit: "smart-casual", posture: "inspect", symbol: "graph",   outfitColor: "#3ab7ff" },
  builder:         { accessory: "tool",       outfit: "workwear",    posture: "carry",   symbol: "wrench",   outfitColor: "#8b5cf6" },
  publisher:       { accessory: "camera",     outfit: "studio",      posture: "typing",  symbol: "play",     outfitColor: "#ec4899" },
  risk:            { accessory: "shield",     outfit: "guard",       posture: "standing", symbol: "shield",  outfitColor: "#ef4444" },
  knowledge:       { accessory: "book",       outfit: "scholar",     posture: "inspect", symbol: "book",     outfitColor: "#8b5cf6" },
  system:          { accessory: "core",       outfit: "command",     posture: "console", symbol: "core",     outfitColor: "#2f9bff" },
  support:         { accessory: "clipboard",  outfit: "ops-casual",  posture: "standing", symbol: "list",    outfitColor: "#f5b942" },
  vipHandler:      { accessory: "phone-gold", outfit: "business",    posture: "phone",   symbol: "star",     outfitColor: "#f5b942" },
  telegramHandler: { accessory: "phone",      outfit: "comms",       posture: "phone",   symbol: "message",  outfitColor: "#00d9ff" },
  assetManager:    { accessory: "media-pack", outfit: "editorial",   posture: "carry",   symbol: "folder",   outfitColor: "#14b8a6" },
  notebookPlanner: { accessory: "notebook",   outfit: "planner",     posture: "typing",  symbol: "notebook", outfitColor: "#f8f1df" },
  proofAuditor:    { accessory: "seal",       outfit: "auditor",     posture: "inspect", symbol: "seal",     outfitColor: "#cbd5e1" },
};

/** appartenance maison → type d'avatar par défaut (signal fort) */
const HOUSE_DEFAULT_TYPE: Record<string, AgentAvatarType> = {
  mt4_signal_tower: "trader",
  trading_academy: "analyst",
  mission_control_tower: "operator",
  central_brain: "system",
  obsidian_library: "knowledge",
  lightrag_observatory: "knowledge",
  youtube_studio: "publisher",
  assets_warehouse: "assetManager",
  paperclip_factory: "builder",
  iron_office: "vipHandler",
  site_seo_lab: "analyst",
  vip_gate: "telegramHandler",
  compliance_port: "risk",
  calendar_tower: "support",
  openclaw_agent_barracks: "operator",
  notebook_alm: "notebookPlanner",
  proof_ledger: "proofAuditor",
};

/**
 * resolveAgentType — déterministe : role_badge (signal métier précis) d'abord,
 * sinon maison propriétaire. Évite les clones : deux agents d'une même maison
 * peuvent avoir des types différents selon leur rôle.
 */
export function resolveAgentType(houseId: string, roleBadge: string | undefined): AgentAvatarType {
  const r = (roleBadge ?? "").toLowerCase();
  if (/proof|audit|ledger|reviewer/.test(r)) return "proofAuditor";
  if (/notebook|alm|planner|roadmap|stratèg|strateg/.test(r)) return "notebookPlanner";
  if (/risk|complian|juriste|legal|fiscal|guardian/.test(r)) return "risk";
  if (/vip|closer|sales|revenue|crm|broker|affili/.test(r)) return "vipHandler";
  if (/telegram|broadcast|community|social|voice|comms?/.test(r)) return "telegramHandler";
  if (/publish|video|studio|render|content|copywriter|marketing/.test(r)) return "publisher";
  if (/trade|trading|quant|signal|market|miro/.test(r)) return "trader";
  if (/analyst|seo|site|web|research|lab/.test(r)) return "analyst";
  if (/knowledge|obsidian|lightrag|memory|steward|archive|librar/.test(r)) return "knowledge";
  if (/build|paperclip|factory|ops|devops|engineer/.test(r)) return "builder";
  if (/asset|inventory|warehouse|distribution/.test(r)) return "assetManager";
  if (/ceo|co-?ceo|manager|coo|director|souverain|chief|command|oracle/.test(r)) return "system";
  if (/operator|gateway|lobster|openclaw|runtime|sentinel|support/.test(r)) return "operator";
  return HOUSE_DEFAULT_TYPE[houseId] ?? "operator";
}

/* ════════ Seed d'avatar stable (jamais de random au render) ════════ */
export type AvatarSeed = {
  faceShape: "round" | "oval" | "square" | "sharp" | "soft";
  skinTone: "light" | "medium" | "tan" | "dark";
  hairStyle: "short" | "curly" | "long" | "bald" | "cap" | "helmet" | "hood";
  hairColor: "black" | "brown" | "blonde" | "auburn" | "gray";
  bodyShape: "slim" | "standard" | "broad";
};
const FACE: AvatarSeed["faceShape"][] = ["round", "oval", "square", "sharp", "soft"];
const SKIN: AvatarSeed["skinTone"][] = ["light", "medium", "tan", "dark"];
const HAIR: AvatarSeed["hairStyle"][] = ["short", "curly", "long", "bald", "cap", "helmet", "hood"];
const HAIRC: AvatarSeed["hairColor"][] = ["black", "brown", "blonde", "auburn", "gray"];
const BODY: AvatarSeed["bodyShape"][] = ["slim", "standard", "broad"];
const SKIN_HEX: Record<AvatarSeed["skinTone"], string> = { light: "#f0d2b0", medium: "#e8c39e", tan: "#cf9d6f", dark: "#9c6b43" };
const HAIR_HEX: Record<AvatarSeed["hairColor"], string> = { black: "#1f2430", brown: "#4a342099", blonde: "#c9a24b", auburn: "#7a3b1d", gray: "#9aa3ad" };

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** seed stable par id agent (identité visuelle constante entre renders) */
export function avatarSeed(agentId: string): AvatarSeed {
  const h = hashStr(agentId || "x");
  // décalages NON-SIGNÉS (>>>) : `>>` rend l'index négatif si bit de poids fort à 1
  return {
    faceShape: FACE[h % FACE.length],
    skinTone: SKIN[(h >>> 3) % SKIN.length],
    hairStyle: HAIR[(h >>> 6) % HAIR.length],
    hairColor: HAIRC[(h >>> 9) % HAIRC.length],
    bodyShape: BODY[(h >>> 12) % BODY.length],
  };
}
export const skinHex = (t: AvatarSeed["skinTone"]) => SKIN_HEX[t];
export const hairHex = (c: AvatarSeed["hairColor"]) => HAIR_HEX[c];
