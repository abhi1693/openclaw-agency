"use client";

/**
 * SupervisionDrawer — panneau latéral du nœud central_brain (carte isométrique).
 * Affiche le flux d'ordonnancement RÉEL du superviseur via /api/.../supervision-coach
 * (source : central_brain_session_coach_latest.json).
 * Fraîcheur honnête : badge STALE + âge dérivé de generated_at_utc (jamais mtime). Re-fetch 60 s.
 * Aucune donnée inventée : si la source est périmée, on l'affiche STALE, pas "à jour".
 */

import { useEffect, useState } from "react";

type Nudge = { severity: string; house: string; nudge: string; action: string };
type Coach = {
  ok: boolean;
  mode: string | null;
  activeWarnCount: number | null;
  generatedAtUtc: string | null;
  ageSec: number | null;
  stale: boolean;
  nudges: Nudge[];
};

function ageLabel(sec: number | null): string {
  if (sec == null) return "?";
  if (sec >= 86400) return `${Math.floor(sec / 86400)}j`;
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 60)}min`;
}

export function SupervisionDrawer() {
  const [data, setData] = useState<Coach | null>(null);
  const [phase, setPhase] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/cofiatrading-world-control/supervision-coach", { cache: "no-store" });
        const json = (await res.json()) as Coach;
        if (!alive) return;
        setData(json);
        setPhase(json.ok ? "ok" : "error");
      } catch {
        if (alive) setPhase("error");
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div
      className="mt-2 rounded-md border border-violet-400/30 bg-slate-950/85 p-2"
      data-widget="supervision-drawer"
      data-coach-stale={data?.stale ? "1" : "0"}
      data-coach-age-sec={data?.ageSec ?? ""}
      data-coach-nudges={data?.nudges?.length ?? 0}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1">
        <span className="text-[10px] font-black uppercase tracking-wide text-violet-300">Terminal supervision · ordres Central Brain</span>
        {data?.stale ? (
          <span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">STALE {ageLabel(data?.ageSec ?? null)}</span>
        ) : (
          <span className="shrink-0 rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">à jour</span>
        )}
      </div>
      <div className="mt-1 text-[9px] text-slate-500">
        mode {data?.mode ?? "?"} · warns {data?.activeWarnCount ?? "?"} · généré {data?.generatedAtUtc ?? "?"}
      </div>
      <div className="mt-1 max-h-[240px] space-y-1 overflow-y-auto">
        {phase === "loading" && <div className="text-[10px] text-slate-500">… chargement</div>}
        {phase === "error" && <div className="text-[10px] text-amber-400">source indisponible</div>}
        {phase === "ok" && (data?.nudges?.length ?? 0) === 0 && <div className="text-[10px] text-slate-500">aucun ordre dans la source</div>}
        {phase === "ok" &&
          data?.nudges?.map((n, i) => (
            <div key={i} className="rounded border border-slate-800/70 bg-slate-900/50 px-1.5 py-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-[8px] font-bold uppercase ${n.severity === "HIGH" ? "text-red-300" : n.severity === "WARN" ? "text-amber-300" : "text-slate-400"}`}>{n.severity}</span>
                {n.house ? <span className="text-[8px] text-slate-500">{n.house}</span> : null}
              </div>
              <div className="text-[10px] leading-snug text-slate-200">{n.nudge}</div>
              {n.action ? <div className="mt-0.5 text-[9px] leading-snug text-slate-400">→ {n.action}</div> : null}
            </div>
          ))}
      </div>
    </div>
  );
}

export default SupervisionDrawer;
