/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING — PROOF LEDGER BADGE (statut de chantier)
 * ────────────────────────────────────────────────────────────────────
 * Pastille présentationnelle du verdict global du gardien. Couleur + TEXTE
 * toujours visibles (règle d'or chips). Réutilisée par le panel + la map.
 * source_tag: COFIAT_PROOF_LEDGER_BADGE_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import type { CofiatManifestFinalStatus } from "@/types/cofiatProofLedger.types";

const STATUS_STYLE: Record<CofiatManifestFinalStatus, { cls: string; label: string }> = {
  APPROVED: { cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100", label: "APPROVED" },
  APPROVED_WITH_WARNINGS: { cls: "border-amber-300/40 bg-amber-300/10 text-amber-100", label: "APPROVED · WARN" },
  BLOCKED: { cls: "border-red-400/45 bg-red-500/10 text-red-200", label: "BLOCKED" },
  NEEDS_SYNC: { cls: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100", label: "NEEDS SYNC" },
  NEEDS_PROOF: { cls: "border-violet-400/40 bg-violet-500/10 text-violet-200", label: "NEEDS PROOF" },
};

export function ProofLedgerBadge({
  status,
  size = "sm",
}: {
  status: CofiatManifestFinalStatus;
  size?: "sm" | "md";
}) {
  const s = STATUS_STYLE[status];
  const pad = size === "md" ? "px-2 py-1 text-[11px]" : "px-1.5 py-0.5 text-[9px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border font-semibold uppercase tracking-wide ${pad} ${s.cls}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

export default ProofLedgerBadge;
