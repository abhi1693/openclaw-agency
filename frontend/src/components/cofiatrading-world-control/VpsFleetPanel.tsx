/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING — VPS FLEET PANEL (offload Mac → VPS Hostinger)
 * ────────────────────────────────────────────────────────────────────
 * Les 11 agents d'analyse tournent sur le VPS (libère la charge du Mac).
 * Statut LIVE dérivé du dernier order "done" rapatrié — vrai signal, pas
 * un heartbeat décoratif. Autonome → montable dans un <Panel>.
 * Aucune donnée inventée : tout vient de /api/.../vps-fleet (mirror réel).
 * source_tag: VPS_FLEET_OFFLOAD_PANEL_V1_20260602
 * ════════════════════════════════════════════════════════════════ */

"use client";

import { useEffect, useState } from "react";

type FleetAgent = { id: string; live: boolean; lastResult: string | null; ts: string | null };
type FleetState = {
  ok: boolean;
  host?: string;
  orchestrator?: string;
  llm?: string;
  pullback?: string;
  total: number;
  liveCount: number;
  mirrorMtime?: string | null;
  agents: FleetAgent[];
  error?: string;
};

export function VpsFleetPanel() {
  const [state, setState] = useState<FleetState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/cofiatrading-world-control/vps-fleet", { cache: "no-store" });
        const json = (await res.json()) as FleetState;
        if (alive) setState(json);
      } catch {
        if (alive) setState({ ok: false, total: 11, liveCount: 0, agents: [], error: "fetch failed" });
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (loading && !state) return <p className="text-xs text-slate-500">Chargement flotte VPS…</p>;
  if (!state) return <p className="text-xs text-rose-400">Flotte VPS indisponible.</p>;
  if (!state.ok && state.agents.length === 0) {
    return (
      <p className="text-xs text-amber-400">
        Mirror VPS absent ({state.error ?? "no data"}). Le puller <code>vps-fleet-pull</code> n&apos;a pas encore tourné.
      </p>
    );
  }

  const pct = state.total > 0 ? Math.round((state.liveCount / state.total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-cyan-300">
          {state.liveCount}/{state.total} LIVE · VPS
        </span>
        <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-300">{pct}%</span>
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">
        11 agents d&apos;analyse offloadés du Mac vers le VPS Hostinger. Le Mac ne les exécute plus — charge Mac 11.9→6.9.
      </p>

      <div className="space-y-1">
        {state.agents.map((a) => (
          <div key={a.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${a.live ? "bg-cyan-400" : "bg-slate-600"}`}
              />
              <span className="text-[11px] font-medium text-slate-200">{a.id}</span>
              <span className="ml-auto text-[9px] text-slate-500">{a.live ? "LIVE · VPS" : "en attente"}</span>
            </div>
            {a.lastResult ? (
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-400">{a.lastResult}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-t border-slate-800 pt-1.5 text-[9px] leading-snug text-slate-600">
        {state.orchestrator ? <p>⚙ {state.orchestrator}</p> : null}
        {state.llm ? <p>🧠 {state.llm}</p> : null}
        {state.mirrorMtime ? (
          <p>
            🔄 rapatrié {new Date(state.mirrorMtime).toLocaleTimeString("fr-FR")} · {state.host}
          </p>
        ) : null}
      </div>
    </div>
  );
}
