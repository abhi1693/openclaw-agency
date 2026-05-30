/**
 * CofiaTrading World Map — selectors & derived structures.
 *
 * Pure, memo-friendly read helpers. `createWorldIndex` builds O(1) lookup maps
 * once; the store rebuilds it when the config changes. Everything else reads
 * from the index so selection / hover / telemetry stay cheap on large graphs.
 */

import type {
  WorldAgent,
  WorldEntityKind,
  WorldEntityStatus,
  WorldHierarchy,
  WorldHouse,
  WorldLink,
  WorldMapConfig,
  WorldTelemetrySnapshot,
  WorldVec2,
  WorldZone,
} from "../types/worldMap.types";

export interface WorldIndex {
  config: WorldMapConfig;
  agents: Map<string, WorldAgent>;
  houses: Map<string, WorldHouse>;
  zones: Map<string, WorldZone>;
  links: Map<string, WorldLink>;
  agentsByHouse: Map<string, WorldAgent[]>;
  housesByZone: Map<string, WorldHouse[]>;
  /** Links touching an entity id (either endpoint). */
  linksByEntity: Map<string, WorldLink[]>;
  /** Computed render position for every agent (orbits home when unset). */
  agentPositions: Map<string, WorldVec2>;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

/** Deterministic orbit position for an agent around its home house. */
function orbitPosition(home: WorldVec2, indexInHouse: number, total: number): WorldVec2 {
  const ring = Math.floor(indexInHouse / 8);
  const perRing = Math.min(total - ring * 8, 8);
  const slot = indexInHouse % 8;
  const radius = 52 + ring * 26;
  // Offset so single agents sit top-right, groups spread evenly.
  const angle = (slot / Math.max(perRing, 1)) * Math.PI * 2 - Math.PI / 2;
  return {
    x: home.x + Math.cos(angle) * radius,
    y: home.y + Math.sin(angle) * radius * 0.62, // slight vertical squash = map feel
  };
}

export function createWorldIndex(config: WorldMapConfig): WorldIndex {
  const agents = new Map<string, WorldAgent>();
  const houses = new Map<string, WorldHouse>();
  const zones = new Map<string, WorldZone>();
  const links = new Map<string, WorldLink>();
  const agentsByHouse = new Map<string, WorldAgent[]>();
  const housesByZone = new Map<string, WorldHouse[]>();
  const linksByEntity = new Map<string, WorldLink[]>();
  const agentPositions = new Map<string, WorldVec2>();

  for (const zone of config.zones) zones.set(zone.id, zone);
  for (const house of config.houses) {
    houses.set(house.id, house);
    pushTo(housesByZone, house.zoneId, house);
  }
  for (const agent of config.agents) {
    agents.set(agent.id, agent);
    pushTo(agentsByHouse, agent.homeId, agent);
  }
  for (const link of config.links) {
    links.set(link.id, link);
    pushTo(linksByEntity, link.fromId, link);
    pushTo(linksByEntity, link.toId, link);
  }

  // Resolve agent render positions (explicit position wins; else orbit home).
  for (const [houseId, list] of agentsByHouse) {
    const home = houses.get(houseId);
    list.forEach((agent, i) => {
      if (agent.position) {
        agentPositions.set(agent.id, agent.position);
      } else if (home) {
        agentPositions.set(agent.id, orbitPosition(home.position, i, list.length));
      } else {
        agentPositions.set(agent.id, { x: 600, y: 350 });
      }
    });
  }

  return {
    config,
    agents,
    houses,
    zones,
    links,
    agentsByHouse,
    housesByZone,
    linksByEntity,
    agentPositions,
  };
}

/* ───────────────────────────── Basic getters ───────────────────────────── */

export const getAgentById = (index: WorldIndex, id: string): WorldAgent | undefined => index.agents.get(id);
export const getHouseById = (index: WorldIndex, id: string): WorldHouse | undefined => index.houses.get(id);
export const getZoneById = (index: WorldIndex, id: string): WorldZone | undefined => index.zones.get(id);
export const getLinkById = (index: WorldIndex, id: string): WorldLink | undefined => index.links.get(id);

export const getAgentsByHouseId = (index: WorldIndex, houseId: string): WorldAgent[] => index.agentsByHouse.get(houseId) ?? [];
export const getHousesByZoneId = (index: WorldIndex, zoneId: string): WorldHouse[] => index.housesByZone.get(zoneId) ?? [];

export const getLinksForAgent = (index: WorldIndex, agentId: string): WorldLink[] => index.linksByEntity.get(agentId) ?? [];
export const getLinksForHouse = (index: WorldIndex, houseId: string): WorldLink[] => index.linksByEntity.get(houseId) ?? [];
export const getLinksForEntity = (index: WorldIndex, entityId: string): WorldLink[] => index.linksByEntity.get(entityId) ?? [];

export const getAgentPosition = (index: WorldIndex, agentId: string): WorldVec2 | undefined => index.agentPositions.get(agentId);

/* ───────────────────────────── Cross-entity helpers ───────────────────────────── */

export function getEntityDisplayName(index: WorldIndex, kind: WorldEntityKind, id: string): string {
  switch (kind) {
    case "agent": return index.agents.get(id)?.name ?? id;
    case "house": return index.houses.get(id)?.name ?? id;
    case "zone": return index.zones.get(id)?.name ?? id;
    case "link": return index.links.get(id)?.id ?? id;
    default: return id;
  }
}

/** Effective status (runtime override wins over the seed/config status). */
export function getEntityStatus(
  index: WorldIndex,
  kind: WorldEntityKind,
  id: string,
  overrides: Record<string, WorldEntityStatus> = {},
): WorldEntityStatus | undefined {
  if (overrides[id]) return overrides[id];
  switch (kind) {
    case "agent": return index.agents.get(id)?.status;
    case "house": return index.houses.get(id)?.status;
    case "zone": return index.zones.get(id)?.status;
    case "link": return undefined;
    default: return undefined;
  }
}

export function getEntityPosition(index: WorldIndex, kind: WorldEntityKind, id: string): WorldVec2 | undefined {
  switch (kind) {
    case "agent": return index.agentPositions.get(id);
    case "house": return index.houses.get(id)?.position;
    case "zone": return index.zones.get(id)?.position;
    default: return undefined;
  }
}

export interface ResolvedLinkEndpoints {
  from: WorldVec2 | undefined;
  to: WorldVec2 | undefined;
}

export function getLinkEndpoints(index: WorldIndex, link: WorldLink): ResolvedLinkEndpoints {
  return {
    from: getEntityPosition(index, link.fromType, link.fromId),
    to: getEntityPosition(index, link.toType, link.toId),
  };
}

/* ───────────────────────────── Telemetry read ───────────────────────────── */

export function getTelemetryForEntity(
  telemetry: WorldTelemetrySnapshot | null,
  kind: WorldEntityKind,
  id: string,
): Record<string, number> | undefined {
  if (!telemetry) return undefined;
  if (kind === "agent") return telemetry.agents[id] as Record<string, number> | undefined;
  if (kind === "house") return telemetry.houses[id] as Record<string, number> | undefined;
  if (kind === "link") {
    const l = telemetry.links[id];
    return l ? { intensity: l.intensity, health: l.health, frequency: l.frequency } : undefined;
  }
  return undefined;
}

/* ───────────────────────────── Hierarchy / org chart ───────────────────────────── */

export function buildHierarchy(index: WorldIndex): WorldHierarchy {
  const zones = index.config.zones.map((zone) => {
    const houses = getHousesByZoneId(index, zone.id).map((house) => {
      const agents = getAgentsByHouseId(index, house.id).map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        rank: agent.rank,
        status: agent.status,
      }));
      return {
        id: house.id,
        name: house.name,
        type: house.type,
        status: house.status,
        agents,
      };
    });
    return {
      id: zone.id,
      name: zone.name,
      type: zone.type,
      status: zone.status,
      houses,
    };
  });

  return {
    root: "cofiatrading-network",
    name: index.config.meta.name,
    zones,
  };
}
