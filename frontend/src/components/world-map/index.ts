/**
 * CofiaTrading World Map — public module surface.
 */

export { WorldMap, default } from "./WorldMap";
export { WorldMapProvider, useWorldMapContext } from "./WorldMapProvider";
export { WorldMapCanvas } from "./WorldMapCanvas";
export { WorldConsole } from "./WorldConsole";
export { WorldTelemetryPanel } from "./WorldTelemetryPanel";
export { WorldLegend } from "./WorldLegend";
export { WorldHouse } from "./WorldHouse";
export { WorldAgent } from "./WorldAgent";
export { WorldLink } from "./WorldLink";

export { useWorldMap } from "./hooks/useWorldMap";
export { useWorldConsole } from "./hooks/useWorldConsole";
export { useWorldTelemetry } from "./hooks/useWorldTelemetry";
export { useEntitySelection } from "./hooks/useEntitySelection";

export { worldMapConfig, worldZones, worldHouses, worldAgents } from "./config/worldMapConfig";
export { worldAssets, STATUS_TOKEN } from "./config/worldAssets";
export { validateWorldMapConfig } from "./utils/validateWorldMapConfig";
export { createWorldIndex } from "./utils/worldMapSelectors";
export {
  createWorldMapStore,
  dispatchWorldEvent,
  worldActions,
} from "./store/worldMapStore";

export type * from "./types/worldMap.types";
