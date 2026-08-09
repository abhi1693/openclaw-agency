"use client";

/**
 * WorldLink — an animated SVG relationship between two entities.
 * Curved path + flowing dash + a light particle travelling along it
 * (animateMotion/mpath). Opacity & width encode state and strength.
 */

import { memo, type CSSProperties, type KeyboardEvent } from "react";

import styles from "./WorldMap.module.css";
import { LINK_COLOR } from "./config/worldAssets";
import type { WorldLink as WorldLinkType, WorldVec2 } from "./types/worldMap.types";

export interface WorldLinkProps {
  link: WorldLinkType;
  from: WorldVec2 | undefined;
  to: WorldVec2 | undefined;
  intensity?: number;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  flowDuration: number;
  onSelect: (id: string) => void;
}

function controlPoint(a: WorldVec2, b: WorldVec2): WorldVec2 {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = Math.min(64, len * 0.18);
  return { x: mx + (-dy / len) * off, y: my + (dx / len) * off };
}

function WorldLinkImpl({
  link,
  from,
  to,
  selected,
  highlighted,
  dimmed,
  flowDuration,
  onSelect,
}: WorldLinkProps) {
  if (!from || !to) return null;

  const c = controlPoint(from, to);
  const d = `M ${from.x} ${from.y} Q ${c.x} ${c.y} ${to.x} ${to.y}`;
  const color = LINK_COLOR[link.type] ?? "#38bdf8";
  const baseWidth = 1 + link.strength * 2.2;
  const width = selected ? baseWidth + 1.4 : baseWidth;
  const opacity = dimmed ? 0.07 : selected ? 0.98 : highlighted ? 0.82 : 0.3 + link.strength * 0.25;
  const animate = link.animated && !dimmed;
  const pathId = `wm-link-${link.id}`;
  const dashStyle = { "--wm-flow-dur": `${flowDuration}s` } as CSSProperties;

  const handleKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(link.id);
    }
  };

  return (
    <g
      className={styles.interactive}
      role="button"
      tabIndex={0}
      aria-label={`Lien ${link.type} ${link.fromId} vers ${link.toId}`}
      opacity={opacity}
      onClick={() => onSelect(link.id)}
      onKeyDown={handleKey}
    >
      <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(width + 10, 12)} />
      <path
        id={pathId}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={animate ? "5 9" : undefined}
        className={animate ? styles.dash : undefined}
        style={animate ? dashStyle : undefined}
      />
      {animate ? (
        <circle r={selected ? 3.4 : 2.4} fill={color} opacity={0.95}>
          <animateMotion dur={`${flowDuration}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
            <mpath href={`#${pathId}`} xlinkHref={`#${pathId}`} />
          </animateMotion>
        </circle>
      ) : null}
    </g>
  );
}

export const WorldLink = memo(WorldLinkImpl);
WorldLink.displayName = "WorldLink";
