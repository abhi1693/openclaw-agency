/**
 * CofiaTrading World Map — event helpers.
 *
 * Turns a typed `WorldConsoleEvent` into a human-readable log entry. Pure
 * functions only; the store owns the actual dispatch/state mutation.
 */

import type {
  WorldConsoleEvent,
  WorldLogEntry,
} from "../types/worldMap.types";

let logCounter = 0;

/** HH:MM:SS in local time. */
export function formatClockTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface EventDescription {
  label: string;
  entityId?: string;
}

/** Maps an event to a console label + the primary entity it concerns. */
export function describeEvent(event: WorldConsoleEvent): EventDescription {
  switch (event.type) {
    case "AGENT_SELECTED":
      return { label: `Agent sélectionné · ${event.payload.agentId}`, entityId: event.payload.agentId };
    case "HOUSE_SELECTED":
      return { label: `Maison sélectionnée · ${event.payload.houseId}`, entityId: event.payload.houseId };
    case "ZONE_SELECTED":
      return { label: `Zone sélectionnée · ${event.payload.zoneId}`, entityId: event.payload.zoneId };
    case "LINK_SELECTED":
      return { label: `Lien sélectionné · ${event.payload.linkId}`, entityId: event.payload.linkId };
    case "ENTITY_HOVERED":
      return { label: `Survol ${event.payload.kind} · ${event.payload.id}`, entityId: event.payload.id };
    case "ENTITY_UNHOVERED":
      return { label: `Fin survol ${event.payload.kind} · ${event.payload.id}`, entityId: event.payload.id };
    case "AGENT_ASSIGNED":
      return { label: `Assignation ${event.payload.agentId} → ${event.payload.houseId}`, entityId: event.payload.agentId };
    case "STATUS_CHANGED":
      return { label: `Statut ${event.payload.entityId} → ${event.payload.status}`, entityId: event.payload.entityId };
    case "TELEMETRY_PING":
      return { label: `Télémétrie ${event.payload.entityId} · ${event.payload.metric}=${event.payload.value}`, entityId: event.payload.entityId };
    case "FOCUS_ENTITY":
      return { label: `Focus ${event.payload.kind} · ${event.payload.id}`, entityId: event.payload.id };
    case "ALERT_TRIGGERED":
      return { label: `⚠ Alerte déclenchée · ${event.payload.entityId}`, entityId: event.payload.entityId };
    case "STATUS_RESET":
      return { label: `Statut réinitialisé · ${event.payload.entityId}`, entityId: event.payload.entityId };
    case "SELECTION_CLEARED":
      return { label: "Sélection effacée" };
    default: {
      // Exhaustiveness guard — never reached if the union is fully handled.
      const _never: never = event;
      return { label: `Événement inconnu ${JSON.stringify(_never)}` };
    }
  }
}

/** Builds a timestamped, display-ready log entry from an event. */
export function createLogEntry(event: WorldConsoleEvent, now: number = Date.now()): WorldLogEntry {
  const { label, entityId } = describeEvent(event);
  logCounter += 1;
  return {
    id: `evt-${logCounter}-${now}`,
    ts: now,
    time: formatClockTime(now),
    type: event.type,
    label,
    entityId,
  };
}

export const MAX_LOG_ENTRIES = 60;

/** Appends an entry, keeping the most recent `MAX_LOG_ENTRIES` (newest first). */
export function appendLog(logs: WorldLogEntry[], entry: WorldLogEntry): WorldLogEntry[] {
  return [entry, ...logs].slice(0, MAX_LOG_ENTRIES);
}
