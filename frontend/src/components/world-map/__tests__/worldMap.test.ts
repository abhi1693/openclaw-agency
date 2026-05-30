import { describe, expect, it } from "vitest";

import { buildAssignmentLinks, worldAgents, worldMapConfig } from "../config/worldMapConfig";
import { createWorldMapStore } from "../store/worldMapStore";
import {
  createWorldIndex,
  getAgentById,
  getAgentsByHouseId,
  getHouseById,
  getLinksForAgent,
} from "../utils/worldMapSelectors";
import { validateWorldMapConfig } from "../utils/validateWorldMapConfig";

describe("worldMapConfig", () => {
  it("is structurally valid (no errors)", () => {
    const result = validateWorldMapConfig(worldMapConfig);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("has exactly one assignment link per agent", () => {
    expect(buildAssignmentLinks(worldAgents)).toHaveLength(worldAgents.length);
  });

  it("every agent reports to an existing house", () => {
    const houseIds = new Set(worldMapConfig.houses.map((h) => h.id));
    for (const agent of worldMapConfig.agents) {
      expect(houseIds.has(agent.homeId)).toBe(true);
    }
  });

  it("every house belongs to an existing zone", () => {
    const zoneIds = new Set(worldMapConfig.zones.map((z) => z.id));
    for (const house of worldMapConfig.houses) {
      expect(zoneIds.has(house.zoneId)).toBe(true);
    }
  });
});

describe("selectors", () => {
  const index = createWorldIndex(worldMapConfig);

  it("resolves entities by id", () => {
    expect(getAgentById(index, "codex")?.name).toBe("Codex");
    expect(getHouseById(index, "central_brain")?.id).toBe("central_brain");
  });

  it("returns the agents of a house", () => {
    const agents = getAgentsByHouseId(index, "mt4_signal_tower");
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((a) => a.homeId === "mt4_signal_tower")).toBe(true);
  });

  it("returns the links touching an agent (incl. its assignment)", () => {
    const links = getLinksForAgent(index, "codex");
    expect(links.some((l) => l.id === "assign-codex")).toBe(true);
  });

  it("computes a render position for every agent", () => {
    for (const agent of worldMapConfig.agents) {
      expect(index.agentPositions.get(agent.id)).toBeTruthy();
    }
  });
});

describe("store / event bus", () => {
  it("selecting an agent updates selection + focus and appends a log", () => {
    const store = createWorldMapStore(worldMapConfig);
    store.dispatch({ type: "AGENT_SELECTED", payload: { agentId: "luffy" } });
    const state = store.getState();
    expect(state.selection).toEqual({ kind: "agent", id: "luffy" });
    expect(state.focusedId).toBe("luffy");
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].type).toBe("AGENT_SELECTED");
  });

  it("alert then reset toggles a status override", () => {
    const store = createWorldMapStore(worldMapConfig);
    store.dispatch({ type: "ALERT_TRIGGERED", payload: { entityId: "iron_office" } });
    expect(store.getState().statusOverrides.iron_office).toBe("alert");
    store.dispatch({ type: "STATUS_RESET", payload: { entityId: "iron_office" } });
    expect(store.getState().statusOverrides.iron_office).toBeUndefined();
  });

  it("notifies subscribers on change", () => {
    const store = createWorldMapStore(worldMapConfig);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.dispatch({ type: "ZONE_SELECTED", payload: { zoneId: "markets" } });
    expect(calls).toBe(1);
    unsubscribe();
  });
});

describe("validation catches breakage", () => {
  it("flags a dangling agent home", () => {
    const broken = {
      ...worldMapConfig,
      agents: [...worldMapConfig.agents, { ...worldMapConfig.agents[0], id: "ghost", homeId: "nope" }],
    };
    const result = validateWorldMapConfig(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("nope"))).toBe(true);
  });
});
