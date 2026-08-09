"use client";

/**
 * WorldMapCanvas — the layered SVG scene.
 *
 * Render order (back → front): background → grid → zones → links → houses →
 * agents. Selection drives highlight/dim across every layer. Includes
 * wheel-zoom, drag-pan and focus-to-selected (smooth via CSS transition).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import styles from "./WorldMap.module.css";
import { WorldAgent } from "./WorldAgent";
import { WorldHouse } from "./WorldHouse";
import { WorldLink } from "./WorldLink";
import { ZONE_ACCENT } from "./config/worldAssets";
import { useWorldMap } from "./hooks/useWorldMap";
import type { WorldEntityStatus } from "./types/worldMap.types";

const VIEW_W = 1200;
const VIEW_H = 700;
const MIN_SCALE = 0.55;
const MAX_SCALE = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

interface HighlightSets {
  houses: Set<string>;
  agents: Set<string>;
  links: Set<string>;
  active: boolean;
}

export function WorldMapCanvas() {
  const {
    config,
    index,
    zones,
    houses,
    agents,
    links,
    selection,
    hovered,
    focusedId,
    statusOverrides,
    telemetry,
    actions,
  } = useWorldMap();

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [vp, setVp] = useState<Viewport>({ scale: 1, tx: 0, ty: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  const statusOf = useCallback(
    (id: string, base: WorldEntityStatus): WorldEntityStatus => statusOverrides[id] ?? base,
    [statusOverrides],
  );

  /* ── Highlight / dim computation ── */
  const highlight = useMemo<HighlightSets>(() => {
    const h = new Set<string>();
    const a = new Set<string>();
    const l = new Set<string>();
    const focus = selection.id ? selection : hovered;
    if (!focus.kind || !focus.id) return { houses: h, agents: a, links: l, active: false };

    if (focus.kind === "house") {
      h.add(focus.id);
      for (const ag of index.agentsByHouse.get(focus.id) ?? []) a.add(ag.id);
      for (const link of index.linksByEntity.get(focus.id) ?? []) {
        l.add(link.id);
        if (link.fromType === "house") h.add(link.fromId);
        if (link.toType === "house") h.add(link.toId);
      }
    } else if (focus.kind === "agent") {
      a.add(focus.id);
      const agent = index.agents.get(focus.id);
      if (agent) h.add(agent.homeId);
      for (const link of index.linksByEntity.get(focus.id) ?? []) l.add(link.id);
    } else if (focus.kind === "zone") {
      for (const house of index.housesByZone.get(focus.id) ?? []) {
        h.add(house.id);
        for (const ag of index.agentsByHouse.get(house.id) ?? []) a.add(ag.id);
      }
    } else if (focus.kind === "link") {
      const link = index.links.get(focus.id);
      if (link) {
        l.add(link.id);
        if (link.fromType === "house") h.add(link.fromId);
        if (link.toType === "house") h.add(link.toId);
        if (link.fromType === "agent") a.add(link.fromId);
        if (link.toType === "agent") a.add(link.toId);
      }
    }
    return { houses: h, agents: a, links: l, active: true };
  }, [index, selection, hovered]);

  /* ── Focus-to-selected ── */
  useEffect(() => {
    if (!focusedId) return;
    const pos =
      index.houses.get(focusedId)?.position ?? index.agentPositions.get(focusedId) ?? index.zones.get(focusedId)?.position;
    if (!pos) return;
    const raf = requestAnimationFrame(() => {
      setVp((prev) => {
        const scale = Math.max(prev.scale, 1.35);
        return { scale, tx: VIEW_W / 2 - pos.x * scale, ty: VIEW_H / 2 - pos.y * scale };
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusedId, index]);

  /* ── Pan / zoom helpers ── */
  const toViewBox = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return { x: ((clientX - rect.left) / rect.width) * VIEW_W, y: ((clientY - rect.top) / rect.height) * VIEW_H };
  }, []);

  const onWheel = useCallback(
    (e: ReactWheelEvent<SVGSVGElement>) => {
      const vb = toViewBox(e.clientX, e.clientY);
      setVp((prev) => {
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        const scale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
        const wx = (vb.x - prev.tx) / prev.scale;
        const wy = (vb.y - prev.ty) / prev.scale;
        return { scale, tx: vb.x - wx * scale, ty: vb.y - wy * scale };
      });
    },
    [toViewBox],
  );

  const onPointerDown = useCallback((e: ReactPointerEvent<SVGRectElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, tx: 0, ty: 0, moved: false };
    setVp((prev) => {
      if (dragRef.current) {
        dragRef.current.tx = prev.tx;
        dragRef.current.ty = prev.ty;
      }
      return prev;
    });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGRectElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = ((e.clientX - d.x) / rect.width) * VIEW_W;
      const dy = ((e.clientY - d.y) / rect.height) * VIEW_H;
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
      setVp((prev) => ({ ...prev, tx: d.tx + dx, ty: d.ty + dy }));
    },
    [],
  );

  const endDrag = useCallback((e: ReactPointerEvent<SVGRectElement>) => {
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    setDragging(false);
    if (!moved) actions.clearSelection();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, [actions]);

  const resetView = useCallback(() => setVp({ scale: 1, tx: 0, ty: 0 }), []);
  const zoomBy = useCallback(
    (factor: number) =>
      setVp((prev) => {
        const scale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
        const cx = VIEW_W / 2;
        const cy = VIEW_H / 2;
        const wx = (cx - prev.tx) / prev.scale;
        const wy = (cy - prev.ty) / prev.scale;
        return { scale, tx: cx - wx * scale, ty: cy - wy * scale };
      }),
    [],
  );

  /* ── Stable handlers (keep memo on leaves effective) ── */
  const selHouse = useCallback((id: string) => actions.selectHouse(id), [actions]);
  const selAgent = useCallback((id: string) => actions.selectAgent(id), [actions]);
  const selLink = useCallback((id: string) => actions.selectLink(id), [actions]);
  const selZone = useCallback((id: string) => actions.selectZone(id), [actions]);
  const hoverHouse = useCallback((id: string) => actions.hover("house", id), [actions]);
  const unhoverHouse = useCallback((id: string) => actions.unhover("house", id), [actions]);
  const hoverAgent = useCallback((id: string) => actions.hover("agent", id), [actions]);
  const unhoverAgent = useCallback((id: string) => actions.unhover("agent", id), [actions]);

  const anim = config.animation;

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        className={styles.svgRoot}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-label="Carte du monde CofiaTrading — réseau opérationnel"
        onWheel={onWheel}
      >
        <defs>
          <radialGradient id="wm-bg" cx="50%" cy="38%" r="80%">
            <stop offset="0%" stopColor="#0a1830" />
            <stop offset="55%" stopColor="#050d1d" />
            <stop offset="100%" stopColor="#02040a" />
          </radialGradient>
          <pattern id="wm-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0 H0 V48" fill="none" stroke="rgba(120,150,190,0.07)" strokeWidth="1" />
          </pattern>
          <filter id="wm-soft-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* background (fixed) */}
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#wm-bg)" />

        {/* pan/zoom + click-to-clear surface */}
        <rect
          x={0}
          y={0}
          width={VIEW_W}
          height={VIEW_H}
          fill="transparent"
          style={{ cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        />

        <g
          className={dragging ? `${styles.viewport} ${styles.viewportDragging}` : styles.viewport}
          transform={`translate(${vp.tx} ${vp.ty}) scale(${vp.scale})`}
        >
          {/* grid */}
          <rect x={-400} y={-300} width={2000} height={1400} fill="url(#wm-grid)" pointerEvents="none" />

          {/* zones */}
          {zones.map((zone) => {
            const accent = zone.accent || ZONE_ACCENT[zone.type];
            const dim = highlight.active && !highlight.houses.size;
            return (
              <g key={zone.id} opacity={dim ? 0.5 : 1}>
                <ellipse
                  cx={zone.position.x}
                  cy={zone.position.y}
                  rx={zone.radius}
                  ry={zone.radius * 0.72}
                  fill={accent}
                  fillOpacity={0.05}
                  stroke={accent}
                  strokeOpacity={0.28}
                  strokeWidth={1.2}
                  strokeDasharray="4 7"
                  className={styles.interactive}
                  role="button"
                  tabIndex={0}
                  aria-label={`Zone ${zone.name}`}
                  onClick={() => selZone(zone.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selZone(zone.id);
                    }
                  }}
                />
                <text
                  x={zone.position.x}
                  y={zone.position.y - zone.radius * 0.72 - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill={accent}
                  style={{ fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}
                  pointerEvents="none"
                >
                  {zone.name}
                </text>
              </g>
            );
          })}

          {/* links */}
          {links.map((link) => {
            const from = index.agentPositions.get(link.fromId) ?? index.houses.get(link.fromId)?.position;
            const to = index.agentPositions.get(link.toId) ?? index.houses.get(link.toId)?.position;
            const selected = selection.kind === "link" && selection.id === link.id;
            const hl = highlight.links.has(link.id);
            return (
              <WorldLink
                key={link.id}
                link={link}
                from={from}
                to={to}
                intensity={telemetry?.links[link.id]?.intensity}
                selected={selected}
                highlighted={hl}
                dimmed={highlight.active && !hl}
                flowDuration={anim.linkFlowDuration}
                onSelect={selLink}
              />
            );
          })}

          {/* houses */}
          {houses.map((house, i) => {
            const selected = selection.kind === "house" && selection.id === house.id;
            const isHov = hovered.kind === "house" && hovered.id === house.id;
            const dimmed = highlight.active && !highlight.houses.has(house.id);
            return (
              <WorldHouse
                key={house.id}
                house={house}
                status={statusOf(house.id, house.status)}
                selected={selected}
                hovered={isHov}
                dimmed={dimmed}
                pulseDuration={anim.pulseDuration}
                appearDelay={i * 45}
                onSelect={selHouse}
                onHover={hoverHouse}
                onUnhover={unhoverHouse}
              />
            );
          })}

          {/* agents */}
          {agents.map((agent, i) => {
            const pos = index.agentPositions.get(agent.id);
            if (!pos) return null;
            const selected = selection.kind === "agent" && selection.id === agent.id;
            const isHov = hovered.kind === "agent" && hovered.id === agent.id;
            const dimmed = highlight.active && !highlight.agents.has(agent.id);
            return (
              <WorldAgent
                key={agent.id}
                agent={agent}
                position={pos}
                status={statusOf(agent.id, agent.status)}
                selected={selected}
                hovered={isHov}
                dimmed={dimmed}
                floatDuration={anim.idleFloatDuration + (i % 5) * 0.4}
                pulseDuration={anim.pulseDuration}
                appearDelay={300 + i * 22}
                onSelect={selAgent}
                onHover={hoverAgent}
                onUnhover={unhoverAgent}
              />
            );
          })}
        </g>
      </svg>

      {/* zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom avant" className="h-8 w-8 rounded-md border border-cyan-400/30 bg-slate-950/80 text-cyan-200 backdrop-blur transition hover:border-cyan-400/70 hover:text-white">+</button>
        <button type="button" onClick={() => zoomBy(0.83)} aria-label="Zoom arrière" className="h-8 w-8 rounded-md border border-cyan-400/30 bg-slate-950/80 text-cyan-200 backdrop-blur transition hover:border-cyan-400/70 hover:text-white">−</button>
        <button type="button" onClick={resetView} aria-label="Réinitialiser la vue" className="h-8 w-8 rounded-md border border-slate-500/30 bg-slate-950/80 text-[10px] text-slate-300 backdrop-blur transition hover:border-slate-300/70 hover:text-white">RST</button>
      </div>
    </div>
  );
}
