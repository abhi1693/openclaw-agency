"use client";

/**
 * PatrimoinePanel — carte flottante repliable « Patrimoine & Burn » pour le hub :3000.
 * Mission "Claude visible 07". Lit /api/cofiatrading-world-control/patrimoine (read-only).
 * Affiche : burn mensuel, compteurs GREEN/AMBER/WATCH/ARCHIVE, top outils payés non exploités,
 * sources invisibles. Aucune valeur de secret. Composant autonome (self-fetch) → insertion 1 ligne.
 * source_tag: CLAUDE_VISIBLE_07_PATRIMOINE_PANEL_20260602
 */

import { useEffect, useState } from "react";

type PaidUnused = { name: string; usd_month?: number; annual_usd?: number; proof?: string };
type Burn = {
  monthly_usd_material_total?: number;
  annual_usd_material_total?: number;
  monthly_usd_by_verdict?: Record<string, number>;
  potential_annual_savings_if_watch_cut_usd?: number;
};
type Counts = Record<string, number>;
type PatrimoinePayload = {
  ok: boolean;
  generated_at?: string | null;
  age_hours?: number | null;
  burn?: Burn | null;
  counts?: Counts | null;
  paid_unused_top?: PaidUnused[];
  hub3000_invisible?: string[];
  roi_14d?: string[];
  error?: string;
};

const VERDICT_STYLE: Record<string, string> = {
  GREEN: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
  AMBER: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  WATCH: "border-rose-300/40 bg-rose-300/10 text-rose-100",
  ARCHIVE_CANDIDATE: "border-slate-400/40 bg-slate-400/10 text-slate-200",
};

export function PatrimoinePanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PatrimoinePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/patrimoine", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PatrimoinePayload | null) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const burn = data?.burn ?? null;
  const counts = data?.counts ?? null;
  const monthly = burn?.monthly_usd_material_total ?? null;
  const watchMonthly = burn?.monthly_usd_by_verdict?.WATCH ?? null;
  const savings = burn?.potential_annual_savings_if_watch_cut_usd ?? null;

  return (
    <div className="fixed bottom-3 left-3 z-40 max-w-[360px] font-sans">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-amber-300/40 bg-slate-950/90 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-amber-100 shadow-[0_4px_24px_rgba(0,0,0,0.45)] transition hover:border-amber-300/70"
        >
          💰 Patrimoine
          {monthly != null && (
            <span className="rounded bg-amber-300/15 px-1.5 py-0.5 text-amber-200">
              ${monthly}/mo
            </span>
          )}
          {watchMonthly ? (
            <span className="rounded bg-rose-300/15 px-1.5 py-0.5 text-rose-200">
              ⚠ ${watchMonthly} WATCH
            </span>
          ) : null}
        </button>
      ) : (
        <div className="rounded-lg border border-amber-300/25 bg-slate-950/96 p-3 shadow-[0_8px_40px_rgba(0,0,0,0.55)]">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                Patrimoine &amp; Burn · Claude visible 07
              </p>
              <p className="mt-0.5 text-[9px] text-slate-500">
                {data?.generated_at ? `audit ${data.generated_at.slice(0, 10)}` : "audit"}
                {data?.age_hours != null ? ` · il y a ${data.age_hours}h` : ""} · NO_FALSE_GREEN
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white"
              aria-label="Replier"
            >
              ✕
            </button>
          </div>

          {!data || data.ok === false ? (
            <p className="text-[11px] text-rose-200">
              {data?.error ?? "Patrimoine indisponible (route /patrimoine)."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md border border-slate-700/60 bg-slate-900/70 px-2 py-1.5">
                  <p className="text-[8.5px] uppercase tracking-[0.14em] text-slate-500">Burn / mois</p>
                  <p className="text-lg font-black text-white">${monthly ?? "—"}</p>
                </div>
                <div className="rounded-md border border-rose-400/30 bg-rose-400/8 px-2 py-1.5">
                  <p className="text-[8.5px] uppercase tracking-[0.14em] text-rose-300/80">Économie/an si cut</p>
                  <p className="text-lg font-black text-rose-100">${savings ?? "—"}</p>
                </div>
              </div>

              {counts && (
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {(["GREEN", "AMBER", "WATCH", "ARCHIVE_CANDIDATE"] as const).map((v) => (
                    <div
                      key={v}
                      className={`rounded border px-1 py-1 text-center ${VERDICT_STYLE[v]}`}
                      title={v}
                    >
                      <p className="text-[13px] font-black leading-none">{counts[v] ?? 0}</p>
                      <p className="mt-0.5 text-[7.5px] font-bold uppercase">
                        {v === "ARCHIVE_CANDIDATE" ? "ARCH" : v}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {Array.isArray(data.paid_unused_top) && data.paid_unused_top.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Payés · usage non prouvé (top $/an)
                  </p>
                  <div className="grid gap-1">
                    {data.paid_unused_top.slice(0, 6).map((p) => (
                      <div
                        key={p.name}
                        className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/60 px-2 py-1"
                      >
                        <span className="truncate text-[10px] text-slate-200">{p.name}</span>
                        <span className="shrink-0 rounded bg-rose-300/12 px-1.5 py-0.5 text-[9.5px] font-black text-rose-200">
                          ${p.annual_usd ?? (p.usd_month ?? 0) * 12}/an
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(data.hub3000_invisible) && data.hub3000_invisible.length > 0 && (
                <p className="mt-2 text-[9px] leading-snug text-slate-500">
                  Invisibles hub : {data.hub3000_invisible.length} sources (subscriptions.yaml, matrice 130,
                  asset_vault, gaspillage…).
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
