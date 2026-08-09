"use client";

/**
 * useWorldMap — the primary hook. Exposes the config, the O(1) index, bound
 * actions (typed sugar over the event bus) and bound, memoised selectors.
 */

import { useMemo } from "react";

import { useWorldMapContext } from "../WorldMapProvider";
import { worldActions } from "../store/worldMapStore";
import * as S from "../utils/worldMapSelectors";
import { buildHierarchy } from "../utils/worldMapSelectors";
import type {
  WorldConsoleEvent,
  WorldEntityKind,
} from "../types/worldMap.types";

export function useWorldMap() {
  const { store, state, index } = useWorldMapContext();
  const config = state.config;

  const actions = useMemo(
    () => ({
      selectAgent: (id: string) => worldActions.selectAgent(store, id),
      selectHouse: (id: string) => worldActions.selectHouse(store, id),
      selectZone: (id: string) => worldActions.selectZone(store, id),
      selectLink: (id: string) => worldActions.selectLink(store, id),
      clearSelection: () => worldActions.clearSelection(store),
      hover: (kind: WorldEntityKind, id: string) => worldActions.hover(store, kind, id),
      unhover: (kind: WorldEntityKind, id: string) => worldActions.unhover(store, kind, id),
      focus: (kind: WorldEntityKind, id: string) => worldActions.focus(store, kind, id),
      triggerAlert: (id: string) => worldActions.triggerAlert(store, id),
      resetStatus: (id: string) => worldActions.resetStatus(store, id),
      dispatch: (event: WorldConsoleEvent) => store.dispatch(event),
    }),
    [store],
  );

  const selectors = useMemo(
    () => ({
      getAgentById: (id: string) => S.getAgentById(index, id),
      getHouseById: (id: string) => S.getHouseById(index, id),
      getZoneById: (id: string) => S.getZoneById(index, id),
      getLinkById: (id: string) => S.getLinkById(index, id),
      getAgentsByHouseId: (id: string) => S.getAgentsByHouseId(index, id),
      getHousesByZoneId: (id: string) => S.getHousesByZoneId(index, id),
      getLinksForAgent: (id: string) => S.getLinksForAgent(index, id),
      getLinksForHouse: (id: string) => S.getLinksForHouse(index, id),
      getLinksForEntity: (id: string) => S.getLinksForEntity(index, id),
      getAgentPosition: (id: string) => S.getAgentPosition(index, id),
      getEntityPosition: (kind: WorldEntityKind, id: string) => S.getEntityPosition(index, kind, id),
      getLinkEndpoints: (linkId: string) => {
        const link = S.getLinkById(index, linkId);
        return link ? S.getLinkEndpoints(index, link) : { from: undefined, to: undefined };
      },
      getEntityDisplayName: (kind: WorldEntityKind, id: string) => S.getEntityDisplayName(index, kind, id),
      getEntityStatus: (kind: WorldEntityKind, id: string) =>
        S.getEntityStatus(index, kind, id, state.statusOverrides),
    }),
    [index, state.statusOverrides],
  );

  const hierarchy = useMemo(() => buildHierarchy(index), [index]);

  return {
    config,
    index,
    store,
    state,
    zones: config.zones,
    houses: config.houses,
    agents: config.agents,
    links: config.links,
    selection: state.selection,
    hovered: state.hovered,
    focusedId: state.focusedId,
    statusOverrides: state.statusOverrides,
    telemetry: state.telemetry,
    actions,
    selectors,
    hierarchy,
  };
}
