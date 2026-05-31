/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING — WORK GUARD STATUS (liste compacte des guards)
 * ────────────────────────────────────────────────────────────────────
 * Rend la liste des verdicts de guards (pass/warn/fail + actif/CLI). Le
 * libellé texte du statut est toujours affiché à côté de la pastille.
 * source_tag: COFIAT_WORK_GUARD_STATUS_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import { PROOF_LEDGER_GUARDS } from "@/utils/cofiatProofLedger";
import type { CofiatGuardVerdict, CofiatValidationStatus } from "@/types/cofiatProofLedger.types";

function dotClass(status: CofiatValidationStatus): string {
  switch (status) {
    case "pass":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
    case "warn":
      return "border-amber-300/40 bg-amber-300/10 text-amber-100";
    case "fail":
    default:
      return "border-red-400/45 bg-red-500/10 text-red-200";
  }
}

export function WorkGuardStatus({ guards }: { guards: CofiatGuardVerdict[] }) {
  return (
    <div className="grid gap-1.5">
      {guards.map((g) => {
        const meta = PROOF_LEDGER_GUARDS[g.guard];
        return (
          <div
            key={g.guard}
            className="flex items-start justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/70 p-2"
          >
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-white">{meta.label}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{meta.protects}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${dotClass(
                  g.status
                )}`}
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                {g.status}
              </span>
              <span
                className={`rounded border px-1 py-0.5 text-[8px] uppercase tracking-wide ${
                  g.active
                    ? "border-slate-600/50 bg-slate-800/60 text-slate-300"
                    : "border-violet-400/40 bg-violet-500/10 text-violet-200"
                }`}
              >
                {g.active ? "actif" : "CLI requis"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default WorkGuardStatus;
