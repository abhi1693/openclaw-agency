"use client";

/**
 * WorldAgent — an agent node orbiting its home house. Status ring + initial,
 * idle float, selected glow, expanding alert ring. Label appears on hover/select
 * to keep the map readable with the full roster on screen.
 */

import { memo, type CSSProperties, type KeyboardEvent } from "react";

import styles from "./WorldMap.module.css";
import { STATUS_TOKEN } from "./config/worldAssets";
import type { WorldAgent as WorldAgentType, WorldEntityStatus, WorldVec2 } from "./types/worldMap.types";

export interface WorldAgentProps {
  agent: WorldAgentType;
  position: WorldVec2;
  status: WorldEntityStatus;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  floatDuration: number;
  pulseDuration: number;
  appearDelay: number;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onUnhover: (id: string) => void;
}

function WorldAgentImpl({
  agent,
  position,
  status,
  selected,
  hovered,
  dimmed,
  floatDuration,
  pulseDuration,
  appearDelay,
  onSelect,
  onHover,
  onUnhover,
}: WorldAgentProps) {
  const token = STATUS_TOKEN[status];
  const emphasised = selected || hovered;
  const r = selected ? 14 : 12;
  const initial = agent.name.charAt(0).toUpperCase();
  const isAlert = status === "alert";

  const handleKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(agent.id);
    }
  };

  const floatVar = { "--wm-float-dur": `${floatDuration}s` } as CSSProperties;
  const pulseVar = { "--wm-pulse-dur": `${pulseDuration}s` } as CSSProperties;

  return (
    <g transform={`translate(${position.x} ${position.y})`} opacity={dimmed ? 0.28 : 1}>
      <g
        className={`${styles.appear} ${styles.interactive}`}
        style={{ animationDelay: `${appearDelay}ms` }}
        role="button"
        tabIndex={0}
        aria-label={`Agent ${agent.name}, ${agent.role}, statut ${token.label}`}
        onClick={() => onSelect(agent.id)}
        onKeyDown={handleKey}
        onMouseEnter={() => onHover(agent.id)}
        onMouseLeave={() => onUnhover(agent.id)}
        onFocus={() => onHover(agent.id)}
        onBlur={() => onUnhover(agent.id)}
      >
        {isAlert ? <circle cx={0} cy={0} r={r} fill="none" stroke={token.color} strokeWidth={2} className={styles.ring} style={pulseVar} /> : null}
        {selected ? <circle cx={0} cy={0} r={r + 7} fill={token.glow} className={styles.glow} style={pulseVar} /> : null}

        <g className={styles.float} style={floatVar}>
          <circle cx={0} cy={0} r={r} fill="rgba(9,17,34,0.95)" stroke={token.color} strokeWidth={selected ? 2.6 : 1.8} />
          <text x={0} y={3.5} textAnchor="middle" fontSize={10.5} fill="#e2e8f0" style={{ fontWeight: 600 }}>
            {initial}
          </text>
          <circle cx={r * 0.72} cy={r * 0.72} r={2.6} fill={token.color} />
        </g>
      </g>

      {emphasised ? (
        <g>
          <rect x={-44} y={r + 6} width={88} height={16} rx={8} fill="rgba(2,6,15,0.82)" stroke="rgba(148,163,184,0.25)" strokeWidth={0.5} />
          <text x={0} y={r + 17} textAnchor="middle" fontSize={9.5} fill="#e2e8f0" style={{ fontWeight: 600 }}>
            {agent.name}
          </text>
        </g>
      ) : null}
    </g>
  );
}

export const WorldAgent = memo(WorldAgentImpl);
WorldAgent.displayName = "WorldAgent";
