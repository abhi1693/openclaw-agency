/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING — VPS FLEET OVERLAY (coin bas-droite, repliable)
 * ────────────────────────────────────────────────────────────────────
 * Pill toujours visible sur la carte vivante : "🛰️ Flotte VPS N/11 LIVE".
 * Déployable → liste complète (VpsFleetPanel). Ne touche PAS WorldMapLiving.
 * source_tag: VPS_FLEET_OFFLOAD_PANEL_V1_20260602
 * ════════════════════════════════════════════════════════════════ */

"use client";

import { useEffect, useState } from "react";
import { VpsFleetPanel } from "./VpsFleetPanel";

export function VpsFleetOverlay() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<{ live: number; total: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/cofiatrading-world-control/vps-fleet", { cache: "no-store" });
        const j = (await r.json()) as { liveCount?: number; total?: number };
        if (alive) setCount({ live: j.liveCount ?? 0, total: j.total ?? 11 });
      } catch {
        // silencieux : la pill reste sans compteur si le fetch échoue
      }
    };
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 max-w-[80vw]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-t-xl border border-cyan-500/30 bg-slate-950/95 px-3 py-2 text-left shadow-lg backdrop-blur transition hover:border-cyan-400/60"
      >
        <span className="text-sm">🛰️</span>
        <span className="text-xs font-semibold text-cyan-300">Flotte VPS</span>
        {count ? (
          <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-300">
            {count.live}/{count.total} LIVE
          </span>
        ) : null}
        <span className="ml-auto text-[10px] text-slate-500">{open ? "▼ replier" : "▲ détails"}</span>
      </button>
      {open ? (
        <div className="max-h-[60vh] overflow-y-auto rounded-b-xl border border-t-0 border-cyan-500/30 bg-slate-950/95 p-3 shadow-lg backdrop-blur">
          <VpsFleetPanel />
        </div>
      ) : null}
    </div>
  );
}
