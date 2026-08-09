/**
 * CofiaTrading World Map — Type system (pure, zero-runtime).
 *
 * Single source of truth for every entity, event, telemetry and store shape
 * used by the World Map module. Imported everywhere; never put runtime logic
 * here. Strict-mode clean.
 */

/* ───────────────────────────── Primitives ───────────────────────────── */

export type WorldEntityKind = "zone" | "house" | "agent" | "link";

export type WorldEntityStatus =
  | "online"
  | "offline"
  | "active"
  | "idle"
  | "available"
  | "monitoring"
  | "alert"
  | "pending";

export interface WorldVec2 {
  x: number;
  y: number;
}

/* ───────────────────────────── Zones ───────────────────────────── */

export type WorldZoneType =
  | "operations"
  | "revenue"
  | "content"
  | "trading"
  | "intelligence"
  | "infrastructure";

export interface WorldZone {
  id: string;
  name: string;
  type: WorldZoneType;
  position: WorldVec2;
  /** Soft radius (world units) used to render the zone region + orbit agents. */
  radius: number;
  status: WorldEntityStatus;
  accent: string;
}

/* ───────────────────────────── Houses ───────────────────────────── */

export type WorldHouseType =
  | "headquarters"
  | "intelligence"
  | "revenue"
  | "gateway"
  | "trading"
  | "content"
  | "education"
  | "infrastructure"
  | "compliance"
  | "warehouse";

export interface WorldHouseMetrics {
  /** 0-100 operational activity. */
  activity: number;
  /** ms — round-trip latency to the house services. */
  latency: number;
  /** 0-100 load. */
  load: number;
  /** Connected agents (derived at runtime, optional in seed). */
  agents?: number;
}

export interface WorldHouse {
  id: string;
  name: string;
  type: WorldHouseType;
  /** Key into `worldAssets.houses`. */
  asset: string;
  zoneId: string;
  position: WorldVec2;
  scale: number;
  status: WorldEntityStatus;
  /** 1 = highest. Drives render order + emphasis. */
  priority: number;
  role: string;
  tagline?: string;
  metrics: WorldHouseMetrics;
}

/* ───────────────────────────── Agents ───────────────────────────── */

export type WorldAgentRank =
  | "sovereign"
  | "manager"
  | "lead"
  | "senior"
  | "core"
  | "support";

export type WorldAgentAnimation =
  | "idle"
  | "move"
  | "alert"
  | "assignment"
  | "selected";

export interface WorldAgentMetrics {
  signals: number;
  /** 0-100 %. */
  accuracy: number;
  /** ms. */
  responseTime: number;
  /** 0-100 load, optional. */
  load?: number;
}

export interface WorldAgent {
  id: string;
  name: string;
  role: string;
  /** Key into `worldAssets.agents`. */
  asset: string;
  /** House id this agent reports to. */
  homeId: string;
  /** Optional fixed position; when omitted the renderer orbits it near its home. */
  position?: WorldVec2;
  status: WorldEntityStatus;
  animation: WorldAgentAnimation;
  rank: WorldAgentRank;
  metrics: WorldAgentMetrics;
}

/* ───────────────────────────── Links ───────────────────────────── */

export type WorldLinkType =
  | "assignment"
  | "data"
  | "command"
  | "alert"
  | "network";

export interface WorldLink {
  id: string;
  fromType: WorldEntityKind;
  fromId: string;
  toType: WorldEntityKind;
  toId: string;
  type: WorldLinkType;
  animated: boolean;
  /** 0-1 — visual weight / flow intensity. */
  strength: number;
  /** 0-1 — link health, optional (defaults to strength). */
  health?: number;
}

/* ───────────────────────────── Config ───────────────────────────── */

export interface WorldMapMeta {
  name: string;
  version: string;
  mode: "operational" | "demo" | "maintenance";
  brand: string;
}

export interface WorldAnimationParams {
  /** seconds */
  idleFloatDuration: number;
  /** seconds */
  pulseDuration: number;
  /** seconds — link dash flow loop */
  linkFlowDuration: number;
  /** ms — telemetry refresh cadence */
  telemetryIntervalMs: number;
  /** master toggle (respects prefers-reduced-motion at render time too) */
  enabled: boolean;
}

export interface WorldMapConfig {
  meta: WorldMapMeta;
  zones: WorldZone[];
  houses: WorldHouse[];
  agents: WorldAgent[];
  links: WorldLink[];
  animation: WorldAnimationParams;
}

/* ───────────────────────────── Selection ───────────────────────────── */

export interface WorldSelectionState {
  kind: WorldEntityKind | null;
  id: string | null;
}

/* ───────────────────────────── Events ───────────────────────────── */

export type WorldConsoleEvent =
  | { type: "AGENT_SELECTED"; payload: { agentId: string } }
  | { type: "HOUSE_SELECTED"; payload: { houseId: string } }
  | { type: "ZONE_SELECTED"; payload: { zoneId: string } }
  | { type: "LINK_SELECTED"; payload: { linkId: string } }
  | { type: "ENTITY_HOVERED"; payload: { kind: WorldEntityKind; id: string } }
  | { type: "ENTITY_UNHOVERED"; payload: { kind: WorldEntityKind; id: string } }
  | { type: "AGENT_ASSIGNED"; payload: { agentId: string; houseId: string } }
  | { type: "STATUS_CHANGED"; payload: { entityId: string; status: WorldEntityStatus } }
  | { type: "TELEMETRY_PING"; payload: { entityId: string; metric: string; value: number } }
  | { type: "FOCUS_ENTITY"; payload: { kind: WorldEntityKind; id: string } }
  | { type: "ALERT_TRIGGERED"; payload: { entityId: string } }
  | { type: "STATUS_RESET"; payload: { entityId: string } }
  | { type: "SELECTION_CLEARED"; payload: Record<string, never> };

export type WorldConsoleEventType = WorldConsoleEvent["type"];

export interface WorldLogEntry {
  id: string;
  ts: number;
  /** Pre-formatted HH:MM:SS for display. */
  time: string;
  type: WorldConsoleEventType;
  label: string;
  entityId?: string;
}

/* ───────────────────────────── Telemetry ───────────────────────────── */

export type WorldTelemetrySource = "live" | "simulated" | "registry" | "seed";

export interface WorldTelemetryMetric {
  entityId: string;
  entityKind: WorldEntityKind;
  metric: string;
  value: number;
  unit?: string;
  source: WorldTelemetrySource;
  ts: number;
}

export interface WorldLinkTelemetry {
  intensity: number;
  health: number;
  frequency: number;
}

export interface WorldTelemetrySnapshot {
  ts: number;
  source: WorldTelemetrySource;
  agents: Record<string, WorldAgentMetrics>;
  houses: Record<string, WorldHouseMetrics>;
  links: Record<string, WorldLinkTelemetry>;
}

/* ───────────────────────────── Store ───────────────────────────── */

export interface WorldMapState {
  config: WorldMapConfig;
  selection: WorldSelectionState;
  hovered: WorldSelectionState;
  logs: WorldLogEntry[];
  telemetry: WorldTelemetrySnapshot | null;
  /** Runtime status overrides (e.g. alert triggered from console). */
  statusOverrides: Record<string, WorldEntityStatus>;
  focusedId: string | null;
}

/* ───────────────────────────── Validation ───────────────────────────── */

export interface WorldMapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/* ───────────────────────────── Hierarchy ───────────────────────────── */

export interface WorldHierarchyAgentNode {
  id: string;
  name: string;
  role: string;
  rank: WorldAgentRank;
  status: WorldEntityStatus;
}

export interface WorldHierarchyHouseNode {
  id: string;
  name: string;
  type: WorldHouseType;
  status: WorldEntityStatus;
  agents: WorldHierarchyAgentNode[];
}

export interface WorldHierarchyZoneNode {
  id: string;
  name: string;
  type: WorldZoneType;
  status: WorldEntityStatus;
  houses: WorldHierarchyHouseNode[];
}

export interface WorldHierarchy {
  root: string;
  name: string;
  zones: WorldHierarchyZoneNode[];
}
