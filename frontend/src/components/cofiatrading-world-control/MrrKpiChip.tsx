"use client";

/**
 * MrrKpiChip — KPI Chip financier pour la carte isométrique (/cofiatrading-world-control).
 * Rendu dans la rangée de chips "Agents & Assets" (à côté de "Assets"), style natif.
 * Source = MRR Stripe DIRECT prouvé via /api/world-map/mrr (revenue_loop/latest.json, LIVE_STRIPE_API).
 * AUCUN chiffre en dur (pas de 879 inventé, pas de 782 figé) : "…" tant que pas chargé,
 * "stale" si périmé, "—" si source down. La valeur affichée EST celle lue à la source.
 */

import { useEffect, useState } from "react";

type MrrPayload = {
  ok: boolean;
  mrrEur: number | null;
  activeVip: number | null;
  reconcileTag: string;
  stale: boolean;
};

const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function MrrKpiChip() {
  const [data, setData] = useState<MrrPayload | null>(null);
  const [phase, setPhase] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/world-map/mrr", { cache: "no-store" });
        const json = (await res.json()) as MrrPayload;
        if (!alive) return;
        setData(json);
        setPhase(json.ok && typeof json.mrrEur === "number" ? "ok" : "error");
      } catch {
        if (alive) setPhase("error");
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
    phase === "loading"
      ? "…"
      : phase === "ok" && data?.mrrEur != null
        ? `${EUR.format(data.mrrEur)} · ${data.activeVip ?? "?"} VIP`
        : data?.stale
          ? "stale"
          : "—";
  const targetFalse = data?.reconcileTag === "TARGET_FALSE_CURRENTLY";

  return (
    <span
      className={`inline-flex shrink-0 items-baseline gap-1 rounded-md border px-1.5 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${targetFalse ? "border-amber-400/40 bg-amber-950/30" : "border-emerald-400/40 bg-slate-950/70"}`}
      data-widget="mrr-kpi-chip"
      data-mrr-state={phase}
      data-mrr-eur={data?.mrrEur ?? ""}
      data-mrr-vip={data?.activeVip ?? ""}
      data-mrr-reconcile={data?.reconcileTag ?? ""}
      title="MRR Stripe direct — /api/world-map/mrr (revenue_loop/latest.json)"
    >
      <span className={targetFalse ? "text-amber-300/80" : "text-emerald-300/80"}>MRR réel</span>
      <span className="font-bold text-slate-50">{value}</span>
    </span>
  );
}

export default MrrKpiChip;
