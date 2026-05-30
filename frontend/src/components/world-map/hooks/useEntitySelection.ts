"use client";

/**
 * useEntitySelection — selection + hover state, resolved to the live entity.
 */

import { useCallback, useMemo } from "react";

import { useWorldMapContext } from "../WorldMapProvider";
import { worldActions } from "../store/worldMapStore";
import type {
  WorldAgent,
  WorldEntityKind,
  WorldHouse,
  WorldLink,
  WorldSelectionState,
  WorldZone,
} from "../types/worldMap.types";
import type { WorldIndex } from "../utils/worldMapSelectors";

export type ResolvedEntity =
  | { kind: "agent"; id: string; data: WorldAgent }
  | { kind: "house"; id: string; data: WorldHouse }
  | { kind: "zone"; id: string; data: WorldZone }
  | { kind: "link"; id: string; data: WorldLink }
  | null;

export function resolveEntity(index: WorldIndex, sel: WorldSelectionState): ResolvedEntity {
  if (!sel.kind || !sel.id) return null;
  switch (sel.kind) {
    case "agent": {
      const data = index.agents.get(sel.id);
      return data ? { kind: "agent", id: sel.id, data } : null;
    }
    case "house": {
      const data = index.houses.get(sel.id);
      return data ? { kind: "house", id: sel.id, data } : null;
    }
    case "zone": {
      const data = index.zones.get(sel.id);
      return data ? { kind: "zone", id: sel.id, data } : null;
    }
    case "link": {
      const data = index.links.get(sel.id);
      return data ? { kind: "link", id: sel.id, data } : null;
    }
    default:
      return null;
  }
}

export function useEntitySelection() {
  const { store, state, index } = useWorldMapContext();
  const { selection, hovered, focusedId } = state;

  const selectedEntity = useMemo(() => resolveEntity(index, selection), [index, selection]);
  const hoveredEntity = useMemo(() => resolveEntity(index, hovered), [index, hovered]);

  const isSelected = useCallback(
    (kind: WorldEntityKind, id: string) => selection.kind === kind && selection.id === id,
    [selection],
  );
  const isHovered = useCallback(
    (kind: WorldEntityKind, id: string) => hovered.kind === kind && hovered.id === id,
    [hovered],
  );

  const select = useCallback(
    (kind: WorldEntityKind, id: string) => {
      if (kind === "agent") worldActions.selectAgent(store, id);
      else if (kind === "house") worldActions.selectHouse(store, id);
      else if (kind === "zone") worldActions.selectZone(store, id);
      else worldActions.selectLink(store, id);
    },
    [store],
  );

  const clearSelection = useCallback(() => worldActions.clearSelection(store), [store]);
  const hover = useCallback((kind: WorldEntityKind, id: string) => worldActions.hover(store, kind, id), [store]);
  const unhover = useCallback((kind: WorldEntityKind, id: string) => worldActions.unhover(store, kind, id), [store]);

  return {
    selection,
    hovered,
    focusedId,
    selectedEntity,
    hoveredEntity,
    isSelected,
    isHovered,
    select,
    clearSelection,
    hover,
    unhover,
  };
}
