/**
 * CofiaTrading World Map — central store + event bus.
 *
 * Framework-agnostic observable (subscribe / getSnapshot / dispatch), designed
 * for React 19 `useSyncExternalStore`. Zero external dependency on purpose: the
 * host project uses no zustand/redux, so this stays in-convention while still
 * giving a single source of truth, an event bus and an activity log.
 *
 * `dispatchWorldEvent(store, event)` is the one entry point every interaction
 * funnels through: it (1) mutates state if needed, (2) appends a log, (3)
 * notifies subscribers (→ console + map react). Telemetry is set separately to
 * avoid flooding the log on every tick.
 */

import type {
  WorldConsoleEvent,
  WorldEntityKind,
  WorldEntityStatus,
  WorldMapConfig,
  WorldMapState,
  WorldSelectionState,
  WorldTelemetrySnapshot,
} from "../types/worldMap.types";
import { appendLog, createLogEntry } from "../utils/worldMapEvents";
import { createWorldIndex, type WorldIndex } from "../utils/worldMapSelectors";

export interface WorldMapStore {
  getState: () => WorldMapState;
  getServerState: () => WorldMapState;
  getIndex: () => WorldIndex;
  subscribe: (listener: () => void) => () => void;
  dispatch: (event: WorldConsoleEvent) => void;
  setTelemetry: (snapshot: WorldTelemetrySnapshot) => void;
  applyStatusOverrides: (overrides: Record<string, WorldEntityStatus>) => void;
  reset: () => void;
}

const EMPTY_SELECTION: WorldSelectionState = { kind: null, id: null };

function createInitialState(config: WorldMapConfig): WorldMapState {
  return {
    config,
    selection: { ...EMPTY_SELECTION },
    hovered: { ...EMPTY_SELECTION },
    logs: [],
    telemetry: null,
    statusOverrides: {},
    focusedId: null,
  };
}

/** Pure reducer: returns the next state for an event (may be the same ref). */
function reduce(state: WorldMapState, event: WorldConsoleEvent): WorldMapState {
  switch (event.type) {
    case "AGENT_SELECTED":
      return { ...state, selection: { kind: "agent", id: event.payload.agentId }, focusedId: event.payload.agentId };
    case "HOUSE_SELECTED":
      return { ...state, selection: { kind: "house", id: event.payload.houseId }, focusedId: event.payload.houseId };
    case "ZONE_SELECTED":
      return { ...state, selection: { kind: "zone", id: event.payload.zoneId }, focusedId: event.payload.zoneId };
    case "LINK_SELECTED":
      return { ...state, selection: { kind: "link", id: event.payload.linkId }, focusedId: null };
    case "SELECTION_CLEARED":
      return { ...state, selection: { ...EMPTY_SELECTION }, focusedId: null };
    case "ENTITY_HOVERED":
      return { ...state, hovered: { kind: event.payload.kind, id: event.payload.id } };
    case "ENTITY_UNHOVERED":
      return state.hovered.id === event.payload.id ? { ...state, hovered: { ...EMPTY_SELECTION } } : state;
    case "FOCUS_ENTITY":
      return { ...state, focusedId: event.payload.id };
    case "ALERT_TRIGGERED":
      return { ...state, statusOverrides: { ...state.statusOverrides, [event.payload.entityId]: "alert" } };
    case "STATUS_CHANGED":
      return { ...state, statusOverrides: { ...state.statusOverrides, [event.payload.entityId]: event.payload.status } };
    case "STATUS_RESET": {
      if (!(event.payload.entityId in state.statusOverrides)) return state;
      const next = { ...state.statusOverrides };
      delete next[event.payload.entityId];
      return { ...state, statusOverrides: next };
    }
    case "AGENT_ASSIGNED":
    case "TELEMETRY_PING":
      // Logged only; no structural state change.
      return state;
    default: {
      const _never: never = event;
      void _never;
      return state;
    }
  }
}

export function createWorldMapStore(config: WorldMapConfig): WorldMapStore {
  const serverState = createInitialState(config);
  let state: WorldMapState = serverState;
  let index: WorldIndex = createWorldIndex(config);
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setState = (next: WorldMapState) => {
    if (next === state) return;
    state = next;
    emit();
  };

  return {
    getState: () => state,
    getServerState: () => serverState,
    getIndex: () => index,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (event) => {
      const reduced = reduce(state, event);
      const withLog: WorldMapState = { ...reduced, logs: appendLog(reduced.logs, createLogEntry(event)) };
      setState(withLog);
    },
    setTelemetry: (snapshot) => {
      setState({ ...state, telemetry: snapshot });
    },
    applyStatusOverrides: (overrides) => {
      if (Object.keys(overrides).length === 0) return;
      setState({ ...state, statusOverrides: { ...state.statusOverrides, ...overrides } });
    },
    reset: () => {
      index = createWorldIndex(config);
      setState(createInitialState(config));
    },
  };
}

/** Canonical dispatch entry point (mirrors the brief's `dispatchWorldEvent`). */
export function dispatchWorldEvent(store: WorldMapStore, event: WorldConsoleEvent): void {
  store.dispatch(event);
}

/* Convenience action helpers (typed sugar over dispatch). */
export const worldActions = {
  selectAgent: (store: WorldMapStore, agentId: string) => store.dispatch({ type: "AGENT_SELECTED", payload: { agentId } }),
  selectHouse: (store: WorldMapStore, houseId: string) => store.dispatch({ type: "HOUSE_SELECTED", payload: { houseId } }),
  selectZone: (store: WorldMapStore, zoneId: string) => store.dispatch({ type: "ZONE_SELECTED", payload: { zoneId } }),
  selectLink: (store: WorldMapStore, linkId: string) => store.dispatch({ type: "LINK_SELECTED", payload: { linkId } }),
  clearSelection: (store: WorldMapStore) => store.dispatch({ type: "SELECTION_CLEARED", payload: {} }),
  hover: (store: WorldMapStore, kind: WorldEntityKind, id: string) => store.dispatch({ type: "ENTITY_HOVERED", payload: { kind, id } }),
  unhover: (store: WorldMapStore, kind: WorldEntityKind, id: string) => store.dispatch({ type: "ENTITY_UNHOVERED", payload: { kind, id } }),
  focus: (store: WorldMapStore, kind: WorldEntityKind, id: string) => store.dispatch({ type: "FOCUS_ENTITY", payload: { kind, id } }),
  triggerAlert: (store: WorldMapStore, entityId: string) => store.dispatch({ type: "ALERT_TRIGGERED", payload: { entityId } }),
  resetStatus: (store: WorldMapStore, entityId: string) => store.dispatch({ type: "STATUS_RESET", payload: { entityId } }),
};
