"use client";

/**
 * useWorldTelemetry — read the current telemetry snapshot (the drift loop is
 * owned by the provider) plus manual `refresh()` and `ping()` helpers.
 */

import { useCallback } from "react";

import { useWorldMapContext } from "../WorldMapProvider";
import { getTelemetryForEntity } from "../utils/worldMapSelectors";
import { generateTelemetrySnapshot } from "../utils/worldMapTelemetry";
import type { WorldEntityKind } from "../types/worldMap.types";

export function useWorldTelemetry() {
  const { store, state } = useWorldMapContext();
  const telemetry = state.telemetry;

  const getForEntity = useCallback(
    (kind: WorldEntityKind, id: string) => getTelemetryForEntity(telemetry, kind, id),
    [telemetry],
  );

  const refresh = useCallback(() => {
    store.setTelemetry(generateTelemetrySnapshot(state.config, telemetry));
  }, [store, state.config, telemetry]);

  const ping = useCallback(
    (kind: WorldEntityKind, id: string, metric: string) => {
      const m = getTelemetryForEntity(telemetry, kind, id);
      const value = m?.[metric] ?? 0;
      store.dispatch({ type: "TELEMETRY_PING", payload: { entityId: id, metric, value } });
    },
    [telemetry, store],
  );

  return {
    telemetry,
    source: telemetry?.source ?? "seed",
    lastUpdated: telemetry?.ts ?? null,
    getForEntity,
    refresh,
    ping,
  };
}
