"use client";

/**
 * SiteVercelPanel — volet de la maison site_seo_lab (carte isométrique).
 * Métriques build/déploiement Vercel via /api/.../site-vercel (sonde réelle vercel_live_probe.json).
 * Fraîcheur honnête : badge STALE + âge dérivé de generated_at_utc/ttl (jamais mtime). Re-fetch 60 s.
 * Si la sonde est périmée, on l'affiche STALE — pas de statut frais déguisé. Aucune métrique inventée.
 */

import { useEffect, useState } from "react";

type Vercel = {
  ok: boolean;
  status: string | null;
  summary: string | null;
  publicMetrics: Record<string, unknown> | null;
  generatedAtUtc: string | null;
  ageSec: number | null;
  stale: boolean;
};

function ageLabel(sec: number | null): string {
  if (sec == null) return "?";
  if (sec >= 86400) return `${Math.floor(sec / 86400)}j`;
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 60)}min`;
}

export function SiteVercelPanel() {
  const [data, setData] = useState<Vercel | null>(null);
  const [phase, setPhase] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/cofiatrading-world-control/site-vercel", { cache: "no-store" });
        const json = (await res.json()) as Vercel;
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

  const metrics = data?.publicMetrics ? Object.entries(data.publicMetrics).slice(0, 6) : [];

  return (
    <div
      className="mt-2 rounded-md border border-sky-400/30 bg-slate-950/85 p-2"
      data-widget="site-vercel-panel"
      data-vercel-stale={data?.stale ? "1" : "0"}
      data-vercel-age-sec={data?.ageSec ?? ""}
      data-vercel-status={data?.status ?? ""}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1">
        <span className="text-[10px] font-black uppercase tracking-wide text-sky-300">Build Vercel · cofiatrading.com</span>
        {data?.stale ? (
          <span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">STALE {ageLabel(data?.ageSec ?? null)}</span>
        ) : (
          <span className="shrink-0 rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">à jour</span>
        )}
      </div>
      <div className="mt-1 text-[9px] text-slate-500">statut {data?.status ?? "?"} · sondé {data?.generatedAtUtc ?? "?"}</div>
      {phase === "loading" && <div className="mt-1 text-[10px] text-slate-500">… chargement</div>}
      {phase === "error" && <div className="mt-1 text-[10px] text-amber-400">sonde indisponible</div>}
      {phase === "ok" && data?.summary ? <div className="mt-1 text-[10px] leading-snug text-slate-300">{data.summary}</div> : null}
      {phase === "ok" && metrics.length > 0 ? (
        <div className="mt-1 grid grid-cols-2 gap-1">
          {metrics.map(([k, v]) => (
            <div key={k} className="rounded border border-slate-800/70 bg-slate-900/50 px-1.5 py-0.5">
              <div className="text-[8px] uppercase text-slate-500">{k}</div>
              <div className="text-[10px] font-bold text-slate-100">{String(v)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default SiteVercelPanel;
