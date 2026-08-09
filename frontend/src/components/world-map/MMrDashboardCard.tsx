"use client";

/**
 * MMrDashboardCard — bandeau financier MRR (haut à droite du Hub World Map).
 * Source = MRR Stripe DIRECT prouvé (/api/world-map/mrr → revenue_loop/latest.json, LIVE_STRIPE_API).
 * AUCUN chiffre en dur : "…" tant que pas chargé, "indisponible" si source down, "stale" si périmé.
 * reconcileTag piloté par la donnée (cible MRR non atteinte → TARGET_FALSE_CURRENTLY).
 */

import { useEffect, useState } from "react";

type MrrPayload = {
  ok: boolean;
  mrrEur: number | null;
  activeVip: number | null;
  reconcileTag: string;
  stale: boolean;
  ageSec: number | null;
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

  const mrrText =
    state === "loading" ? "…" : state === "ok" && data?.mrrEur != null ? eur.format(data.mrrEur) : data?.stale ? "stale" : "indisponible";
  const targetFalse = data?.reconcileTag === "TARGET_FALSE_CURRENTLY";

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${targetFalse ? "border-amber-400/40 bg-amber-950/30" : "border-emerald-400/30 bg-slate-950/70"} ${className}`}
      data-widget="mrr-dashboard-card"
      data-mrr-state={state}
      data-mrr-eur={data?.mrrEur ?? ""}
      data-mrr-vip={data?.activeVip ?? ""}
      data-mrr-reconcile={data?.reconcileTag ?? ""}
      data-mrr-stale={data?.stale ? "1" : "0"}
      title="MRR Stripe direct — /api/world-map/mrr (revenue_loop/latest.json)"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/80">MRR</span>
      <span className="text-sm font-semibold tabular-nums text-white">{mrrText}</span>
      {state === "ok" && data?.activeVip != null ? (
        <span className="text-[10px] text-slate-400">· {data.activeVip} VIP</span>
      ) : null}
      {targetFalse ? (
        <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300" title="MRR sous la cible">
          TARGET_FALSE_CURRENTLY
        </span>
      ) : null}
      {state === "error" ? <span className="text-[10px] text-amber-400">source down</span> : null}
    </div>
  );
}

export default MMrDashboardCard;
