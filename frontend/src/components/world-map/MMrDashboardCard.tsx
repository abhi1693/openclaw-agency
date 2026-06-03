"use client";

/**
 * MMrDashboardCard — widget financier MRR (haut à droite du Hub World Map).
 * Lit le MRR RÉEL via /api/world-map/mrr (proxy → :8430/api/iron/revenue/summary).
 * AUCUN chiffre en dur : tant que la source n'a pas répondu → "…", si down → "indisponible".
 * Ne JAMAIS afficher une valeur non sourcée (anti-faux-vert).
 */

import { useEffect, useState } from "react";

type MrrPayload = {
  ok: boolean;
  mrrEur: number | null;
  activeVip: number | null;
  asOf?: string;
};

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function MMrDashboardCard({ className = "" }: { className?: string }) {
  const [data, setData] = useState<MrrPayload | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/world-map/mrr", { cache: "no-store" });
        const json = (await res.json()) as MrrPayload;
        if (!alive) return;
        setData(json);
        setState(json.ok && typeof json.mrrEur === "number" ? "ok" : "error");
      } catch {
        if (alive) setState("error");
      }
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const value =
    state === "loading" ? "…" : state === "ok" && data?.mrrEur != null ? eur.format(data.mrrEur) : "indisponible";

  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-emerald-400/30 bg-slate-950/70 px-3 py-1.5 ${className}`}
      data-widget="mrr-dashboard-card"
      data-mrr-state={state}
      data-mrr-eur={data?.mrrEur ?? ""}
      title="MRR — proxy /api/world-map/mrr vers /api/iron/revenue/summary"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/80">MRR</span>
      <span className="text-sm font-semibold tabular-nums text-white">{value}</span>
      {state === "ok" && data?.activeVip != null ? (
        <span className="text-[10px] text-slate-400">· {data.activeVip} VIP</span>
      ) : null}
      {state === "error" ? <span className="text-[10px] text-amber-400">source down</span> : null}
    </div>
  );
}

export default MMrDashboardCard;
