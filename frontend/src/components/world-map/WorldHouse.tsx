"use client";

/**
 * WorldHouse — a house/base node on the map: stylised "building" card with a
 * glyph, a status dot, a soft pulsing halo and a label beneath. Fully
 * keyboard-accessible (button role, Enter/Space) and hover-aware.
 */

import { memo, type CSSProperties, type KeyboardEvent } from "react";

import styles from "./WorldMap.module.css";
import { HOUSE_GLYPH, STATUS_TOKEN } from "./config/worldAssets";
import type { WorldEntityStatus, WorldHouse as WorldHouseType } from "./types/worldMap.types";

export interface WorldHouseProps {
  house: WorldHouseType;
  status: WorldEntityStatus;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  pulseDuration: number;
  appearDelay: number;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onUnhover: (id: string) => void;
}

function WorldHouseImpl({
  house,
  status,
  selected,
  hovered,
  dimmed,
  pulseDuration,
  appearDelay,
  onSelect,
  onHover,
  onUnhover,
}: WorldHouseProps) {
  const token = STATUS_TOKEN[status];
  const glyph = HOUSE_GLYPH[house.type];
  const s = house.scale;
  const w = 122 * s;
  const h = 58 * s;
  const emphasised = selected || hovered;
  const haloOn = selected || token.pulse;

  const handleKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(house.id);
    }
  };

  const pulseVar = { "--wm-pulse-dur": `${pulseDuration}s` } as CSSProperties;

  return (
    <g transform={`translate(${house.position.x} ${house.position.y})`} opacity={dimmed ? 0.32 : 1}>
      <g className={styles.appear} style={{ animationDelay: `${appearDelay}ms` }}>
        <g
          className={styles.interactive}
          role="button"
          tabIndex={0}
          aria-label={`Maison ${house.name}, statut ${token.label}`}
          onClick={() => onSelect(house.id)}
          onKeyDown={handleKey}
          onMouseEnter={() => onHover(house.id)}
          onMouseLeave={() => onUnhover(house.id)}
          onFocus={() => onHover(house.id)}
          onBlur={() => onUnhover(house.id)}
        >
          {haloOn ? (
            <ellipse
              cx={0}
              cy={0}
              rx={w * 0.7}
              ry={h * 0.95}
              fill={token.glow}
              className={styles.glow}
              style={pulseVar}
            />
          ) : null}

          {/* building base shadow */}
          <rect x={-w / 2 + 4} y={-h / 2 + 8} width={w} height={h} rx={14} fill="rgba(2,6,15,0.55)" />
          {/* building card */}
          <rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            rx={14}
            fill="rgba(8,16,32,0.94)"
            stroke={token.color}
            strokeWidth={selected ? 2.6 : emphasised ? 2 : 1.3}
            filter={selected ? "url(#wm-soft-glow)" : undefined}
          />
          {/* roof accent line */}
          <rect x={-w / 2 + 10} y={-h / 2 + 8} width={w - 20} height={3} rx={1.5} fill={token.color} opacity={0.55} />
          {/* glyph */}
          <text x={0} y={3} textAnchor="middle" fontSize={22 * s} fill={token.color} style={{ fontWeight: 700 }}>
            {glyph}
          </text>
          {/* status dot */}
          <circle cx={w / 2 - 13} cy={-h / 2 + 13} r={4.2} fill={token.color} />
          {token.pulse ? (
            <circle cx={w / 2 - 13} cy={-h / 2 + 13} r={4.2} fill={token.color} className={styles.ring} style={pulseVar} />
          ) : null}
        </g>
      </g>

      {/* label beneath */}
      <text x={0} y={h / 2 + 16} textAnchor="middle" fontSize={11.5} fill={emphasised ? "#f1f5f9" : "#cbd5e1"} style={{ fontWeight: 600 }}>
        {house.name}
      </text>
      {emphasised ? (
        <text x={0} y={h / 2 + 30} textAnchor="middle" fontSize={9.5} fill="#7c8aa3">
          {house.role}
        </text>
      ) : null}
    </g>
  );
}

export const WorldHouse = memo(WorldHouseImpl);
WorldHouse.displayName = "WorldHouse";
