"use client";

/**
 * MrrKpiChip — KPI Chip financier pour la carte isométrique (/cofiatrading-world-control).
 * Rendu dans la rangée de chips "Agents & Assets" (à côté de "Assets"), style natif.
 * Source = MRR Stripe DIRECT prouvé via /api/world-map/mrr (revenue_loop/latest.json, LIVE_STRIPE_API).
 * AUCUN chiffre en dur. La valeur affichée EST celle lue à la source.
 *
 * État visuel piloté par la DONNÉE (reconcileTag du backend), jamais forcé :
 *   TARGET_FALSE_CURRENTLY → bordure ambre (warning, MRR sous la cible)
 *   TARGET_CONFIRMED       → bordure verte flashy + pulse (production, MRR ≥ cible PROUVÉE)
 *   loading / UNKNOWN / down→ bordure neutre
 * Rafraîchissement : re-fetch local toutes les 30 s, SANS rechargement de page (setInterval + setState).
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
    // Re-fetch local périodique → bascule warning↔production sans recharger la page.
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

  const tag = data?.reconcileTag ?? "";
  const confirmed = tag === "TARGET_CONFIRMED"; // vert production — uniquement si données réelles ≥ cible
  const warn = tag === "TARGET_FALSE_CURRENTLY"; // ambre warning — MRR sous la cible

  const tone = confirmed
    ? "border-emerald-400 bg-emerald-500/20 text-slate-50 shadow-[0_0_10px_rgba(16,185,129,0.6)] animate-pulse"
    : warn
      ? "border-amber-400/45 bg-amber-950/30 text-slate-50"
      : "border-slate-600/40 bg-slate-950/70 text-slate-50";
  const labelTone = confirmed ? "text-emerald-300" : warn ? "text-amber-300/85" : "text-emerald-300/80";

  return (
    <span
      className={`inline-flex shrink-0 items-baseline gap-1 rounded-md border px-1.5 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${tone}`}
      data-widget="mrr-kpi-chip"
      data-mrr-state={phase}
      data-mrr-eur={data?.mrrEur ?? ""}
      data-mrr-vip={data?.activeVip ?? ""}
      data-mrr-reconcile={tag}
      title="MRR Stripe direct — /api/world-map/mrr (revenue_loop/latest.json)"
    >
      <span className={labelTone}>MRR réel</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

export default MrrKpiChip;
