"use client";

/**
 * useWorldConsole — turns the current selection into a ready-to-render console
 * descriptor (name, status, metrics, members, actions) and exposes the console
 * actions. Reads telemetry so metrics reflect the live (simulated) feed.
 */

import { useCallback, useMemo } from "react";

import { useWorldMapContext } from "../WorldMapProvider";
import { worldActions } from "../store/worldMapStore";
import * as S from "../utils/worldMapSelectors";
import { resolveEntity } from "./useEntitySelection";
import type {
  WorldEntityKind,
  WorldEntityStatus,
  WorldLogEntry,
} from "../types/worldMap.types";

export type ConsoleAction =
  | "focus"
  | "showLinkedHouse"
  | "triggerAlert"
  | "resetStatus"
  | "showTelemetry";

export interface ConsoleMetric {
  label: string;
  value: string;
}

export interface ConsoleMember {
  kind: WorldEntityKind;
  id: string;
  name: string;
  sub: string;
  status?: WorldEntityStatus;
}

export interface ConsoleDescriptor {
  kind: WorldEntityKind;
  id: string;
  name: string;
  typeLabel: string;
  status?: WorldEntityStatus;
  role?: string;
  homeId?: string;
  homeName?: string;
  zoneName?: string;
  membersLabel?: string;
  members?: ConsoleMember[];
  relation?: { fromName: string; toName: string; type: string; strength: number };
  metrics: ConsoleMetric[];
  actions: ConsoleAction[];
}

const fmt = (n: number | undefined, suffix = ""): string =>
  n === undefined || Number.isNaN(n) ? "—" : `${Math.round(n)}${suffix}`;

export function useWorldConsole() {
  const { store, state, index } = useWorldMapContext();
  const { selection, telemetry, statusOverrides, logs } = state;

  const descriptor = useMemo<ConsoleDescriptor | null>(() => {
    const entity = resolveEntity(index, selection);
    if (!entity) return null;

    if (entity.kind === "agent") {
      const a = entity.data;
      const t = telemetry?.agents[a.id] ?? a.metrics;
      const home = index.houses.get(a.homeId);
      return {
        kind: "agent",
        id: a.id,
        name: a.name,
        typeLabel: "Agent",
        status: statusOverrides[a.id] ?? a.status,
        role: a.role,
        homeId: a.homeId,
        homeName: home?.name ?? a.homeId,
        metrics: [
          { label: "Signaux", value: fmt(t.signals) },
          { label: "Précision", value: fmt(t.accuracy, "%") },
          { label: "Réponse", value: fmt(t.responseTime, "ms") },
          { label: "Rang", value: a.rank },
        ],
        actions: ["focus", "showLinkedHouse", "triggerAlert", "resetStatus", "showTelemetry"],
      };
    }

    if (entity.kind === "house") {
      const h = entity.data;
      const t = telemetry?.houses[h.id] ?? h.metrics;
      const zone = index.zones.get(h.zoneId);
      const members: ConsoleMember[] = S.getAgentsByHouseId(index, h.id).map((ag) => ({
        kind: "agent",
        id: ag.id,
        name: ag.name,
        sub: ag.role,
        status: statusOverrides[ag.id] ?? ag.status,
      }));
      return {
        kind: "house",
        id: h.id,
        name: h.name,
        typeLabel: `Maison · ${h.type}`,
        status: statusOverrides[h.id] ?? h.status,
        role: h.role,
        zoneName: zone?.name ?? h.zoneId,
        membersLabel: `Agents (${members.length})`,
        members,
        metrics: [
          { label: "Activité", value: fmt(t.activity, "%") },
          { label: "Latence", value: fmt(t.latency, "ms") },
          { label: "Charge", value: fmt(t.load, "%") },
          { label: "Agents", value: fmt(members.length) },
        ],
        actions: ["focus", "triggerAlert", "resetStatus", "showTelemetry"],
      };
    }

    if (entity.kind === "zone") {
      const z = entity.data;
      const houses = S.getHousesByZoneId(index, z.id);
      const members: ConsoleMember[] = houses.map((h) => ({
        kind: "house",
        id: h.id,
        name: h.name,
        sub: h.role,
        status: statusOverrides[h.id] ?? h.status,
      }));
      const agentCount = houses.reduce((acc, h) => acc + S.getAgentsByHouseId(index, h.id).length, 0);
      return {
        kind: "zone",
        id: z.id,
        name: z.name,
        typeLabel: `Zone · ${z.type}`,
        status: statusOverrides[z.id] ?? z.status,
        membersLabel: `Maisons (${houses.length})`,
        members,
        metrics: [
          { label: "Maisons", value: fmt(houses.length) },
          { label: "Agents", value: fmt(agentCount) },
        ],
        actions: ["focus"],
      };
    }

    // link
    const l = entity.data;
    const fromName = S.getEntityDisplayName(index, l.fromType, l.fromId);
    const toName = S.getEntityDisplayName(index, l.toType, l.toId);
    const lt = telemetry?.links[l.id];
    return {
      kind: "link",
      id: l.id,
      name: `${fromName} → ${toName}`,
      typeLabel: `Lien · ${l.type}`,
      relation: { fromName, toName, type: l.type, strength: l.strength },
      metrics: [
        { label: "Force", value: fmt(l.strength * 100, "%") },
        { label: "Intensité", value: fmt(lt?.intensity, "%") },
        { label: "Santé", value: fmt(lt?.health ?? (l.health ?? l.strength) * 100, "%") },
      ],
      actions: ["focus", "showTelemetry"],
    };
  }, [index, selection, telemetry, statusOverrides]);

  const runAction = useCallback(
    (action: ConsoleAction) => {
      if (!descriptor) return;
      const { kind, id } = descriptor;
      switch (action) {
        case "focus":
          worldActions.focus(store, kind, id);
          break;
        case "showLinkedHouse":
          if (descriptor.homeId) worldActions.selectHouse(store, descriptor.homeId);
          break;
        case "triggerAlert":
          worldActions.triggerAlert(store, id);
          break;
        case "resetStatus":
          worldActions.resetStatus(store, id);
          break;
        case "showTelemetry": {
          const metric = kind === "agent" ? "accuracy" : kind === "house" ? "activity" : "intensity";
          const source =
            kind === "agent"
              ? telemetry?.agents[id]
              : kind === "house"
                ? telemetry?.houses[id]
                : undefined;
          const value = (source as Record<string, number> | undefined)?.[metric] ?? 0;
          store.dispatch({ type: "TELEMETRY_PING", payload: { entityId: id, metric, value } });
          break;
        }
        default:
          break;
      }
    },
    [descriptor, store, telemetry],
  );

  const selectMember = useCallback(
    (member: ConsoleMember) => {
      if (member.kind === "agent") worldActions.selectAgent(store, member.id);
      else if (member.kind === "house") worldActions.selectHouse(store, member.id);
      else if (member.kind === "zone") worldActions.selectZone(store, member.id);
    },
    [store],
  );

  const logEntries: WorldLogEntry[] = logs;

  return {
    descriptor,
    logs: logEntries,
    telemetrySource: telemetry?.source ?? "seed",
    runAction,
    selectMember,
    clear: useCallback(() => worldActions.clearSelection(store), [store]),
  };
}
