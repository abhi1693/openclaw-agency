/**
 * CofiaTrading World Map — config validator.
 *
 * Catches the classes of mistake that break the map: dangling references,
 * duplicate ids, out-of-range values, unknown assets. Errors fail the config;
 * warnings are surfaced in dev only. Pure + side-effect free.
 */

import { worldAssets } from "../config/worldAssets";
import type {
  WorldMapConfig,
  WorldMapValidationResult,
} from "../types/worldMap.types";

const houseAssetKeys = new Set(Object.keys(worldAssets.houses));
const agentAssetKeys = new Set(Object.keys(worldAssets.agents));

export function validateWorldMapConfig(config: WorldMapConfig): WorldMapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const zoneIds = new Set<string>();
  const houseIds = new Set<string>();
  const agentIds = new Set<string>();
  const linkIds = new Set<string>();

  // ── Unique ids ──
  for (const zone of config.zones) {
    if (zoneIds.has(zone.id)) errors.push(`Zone id dupliqué: "${zone.id}"`);
    zoneIds.add(zone.id);
  }
  for (const house of config.houses) {
    if (houseIds.has(house.id)) errors.push(`Maison id dupliquée: "${house.id}"`);
    houseIds.add(house.id);
  }
  for (const agent of config.agents) {
    if (agentIds.has(agent.id)) errors.push(`Agent id dupliqué: "${agent.id}"`);
    agentIds.add(agent.id);
  }
  for (const link of config.links) {
    if (linkIds.has(link.id)) errors.push(`Lien id dupliqué: "${link.id}"`);
    linkIds.add(link.id);
  }

  // ── Referential integrity ──
  for (const house of config.houses) {
    if (!zoneIds.has(house.zoneId)) {
      errors.push(`Maison "${house.id}" référence une zone inexistante: "${house.zoneId}"`);
    }
    if (!houseAssetKeys.has(house.asset)) {
      warnings.push(`Maison "${house.id}" utilise un asset inconnu du registry: "${house.asset}"`);
    }
  }

  for (const agent of config.agents) {
    if (!houseIds.has(agent.homeId)) {
      errors.push(`Agent "${agent.id}" assigné à une maison inexistante: "${agent.homeId}"`);
    }
    if (!agentAssetKeys.has(agent.asset)) {
      warnings.push(`Agent "${agent.id}" utilise un asset inconnu du registry: "${agent.asset}"`);
    }
    if (agent.metrics.accuracy < 0 || agent.metrics.accuracy > 100) {
      warnings.push(`Agent "${agent.id}" accuracy hors plage 0-100: ${agent.metrics.accuracy}`);
    }
  }

  const idExists = (kind: string, id: string): boolean => {
    switch (kind) {
      case "agent": return agentIds.has(id);
      case "house": return houseIds.has(id);
      case "zone": return zoneIds.has(id);
      case "link": return linkIds.has(id);
      default: return false;
    }
  };

  for (const link of config.links) {
    if (!idExists(link.fromType, link.fromId)) {
      errors.push(`Lien "${link.id}" source introuvable: ${link.fromType} "${link.fromId}"`);
    }
    if (!idExists(link.toType, link.toId)) {
      errors.push(`Lien "${link.id}" destination introuvable: ${link.toType} "${link.toId}"`);
    }
    if (link.strength < 0 || link.strength > 1) {
      warnings.push(`Lien "${link.id}" strength hors plage 0-1: ${link.strength}`);
    }
  }

  // ── Soft structure warnings ──
  for (const zone of config.zones) {
    const houseCount = config.houses.filter((h) => h.zoneId === zone.id).length;
    if (houseCount === 0) warnings.push(`Zone "${zone.id}" ne contient aucune maison.`);
  }
  for (const house of config.houses) {
    const agentCount = config.agents.filter((a) => a.homeId === house.id).length;
    if (agentCount === 0) warnings.push(`Maison "${house.id}" n'a aucun agent assigné.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
