"use client";

/**
 * CofiaTrading World Map — provider.
 *
 * Owns the single store instance, subscribes once via `useSyncExternalStore`,
 * and runs the root effects exactly once: dev validation, the simulated
 * telemetry loop (interval, cleaned up), and a best-effort fetch of REAL house
 * statuses from the server proxy. Everything below reads from context.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { worldMapConfig as defaultConfig } from "./config/worldMapConfig";
import {
  createWorldMapStore,
  type WorldMapStore,
} from "./store/worldMapStore";
import type {
  WorldMapConfig,
  WorldMapState,
} from "./types/worldMap.types";
import {
  fetchLiveHouseStatuses,
  generateTelemetrySnapshot,
} from "./utils/worldMapTelemetry";
import { validateWorldMapConfig } from "./utils/validateWorldMapConfig";
import type { WorldIndex } from "./utils/worldMapSelectors";

interface WorldMapContextValue {
  store: WorldMapStore;
  state: WorldMapState;
  index: WorldIndex;
}

const WorldMapContext = createContext<WorldMapContextValue | null>(null);

export interface WorldMapProviderProps {
  config?: WorldMapConfig;
  /** Attempt to pull real house statuses from the server proxy. */
  live?: boolean;
  children: ReactNode;
}

export function WorldMapProvider({
  config = defaultConfig,
  live = true,
  children,
}: WorldMapProviderProps) {
  const storeRef = useRef<WorldMapStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createWorldMapStore(config);
  }
  const store = storeRef.current;

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getServerState);
  const index = store.getIndex();

  // Dev-only config validation → console warnings, never crashes the UI.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const result = validateWorldMapConfig(config);
    if (result.errors.length > 0) {
      // eslint-disable-next-line no-console
      console.error("[WorldMap] config invalide:", result.errors);
    }
    if (result.warnings.length > 0) {
      // eslint-disable-next-line no-console
      console.warn("[WorldMap] avertissements config:", result.warnings);
    }
  }, [config]);

  // Simulated telemetry loop (clearInterval on cleanup). Always seeds once so
  // the first paint already has numbers; drifts thereafter when enabled.
  useEffect(() => {
    let prev = generateTelemetrySnapshot(config);
    store.setTelemetry(prev);
    if (!config.animation.enabled) return;

    const id = window.setInterval(() => {
      prev = generateTelemetrySnapshot(config, prev);
      store.setTelemetry(prev);
    }, config.animation.telemetryIntervalMs);

    return () => window.clearInterval(id);
  }, [config, store]);

  // Best-effort REAL house statuses (registry proxy). Failure is silent.
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    fetchLiveHouseStatuses(config, controller.signal)
      .then((overrides) => store.applyStatusOverrides(overrides))
      .catch(() => undefined);
    return () => controller.abort();
  }, [config, store, live]);

  const value = useMemo<WorldMapContextValue>(
    () => ({ store, state, index }),
    [store, state, index],
  );

  return <WorldMapContext.Provider value={value}>{children}</WorldMapContext.Provider>;
}

export function useWorldMapContext(): WorldMapContextValue {
  const ctx = useContext(WorldMapContext);
  if (ctx === null) {
    throw new Error("useWorldMapContext doit être utilisé dans <WorldMapProvider>.");
  }
  return ctx;
}
