/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING — AUTH / PROVIDERS STATUS PANEL (No-False-Green)
 * ────────────────────────────────────────────────────────────────────
 * Carte présentationnelle pure (zéro fetch) du cockpit World-Control.
 * Lit le ledger d'auth canonique + le guard NO-FALSE-GREEN (§7/§35) +
 * l'état résolu de l'adapter Console IA, et les rend en sections triées
 * par criticité/statut. Chaque GREEN/LIVE montre sa preuve réelle ;
 * chaque AMBER/RED/UNKNOWN/ADAPTER_MISSING montre son blocker.
 *
 * Style : reprend la palette sombre fintech des panneaux WorldControl
 * (rounded-md border slate-800, bg-slate-950/70, chips text-[9px/10px]).
 * Règle d'or chips : la couleur ne suffit JAMAIS — le TEXTE du statut est
 * toujours affiché à côté de la pastille.
 *
 * source_tag: COFIAT_AUTH_PROVIDER_STATUS_PANEL_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import { cofiatAuthProofLedger } from "@/config/cofiatAuthProofLedger";
import {
  validateNoFalseGreen,
  summarizeStatuses,
} from "@/utils/cofiatNoFalseGreenGuard";
import { getConsoleIaAdapterState } from "@/config/cofiatConsoleIaAdapter";
import type {
  AuthLedgerItem,
  OperationalStatus,
} from "@/types/cofiatWorld.types";

/* ── style des pastilles de statut (couleur + TEXTE toujours visible) ── */

/**
 * Classe Tailwind par statut. La couleur encode la sémantique mais le
 * libellé texte (rendu à côté) reste la source de vérité accessible.
 *  GREEN/LIVE=emerald · AMBER*=amber · RED=red ·
 *  OPTIONAL_COVERED=slate · ADAPTER_MISSING=violet · UNKNOWN=zinc.
 */
function statusChipClass(status: OperationalStatus): string {
  switch (status) {
    case "GREEN":
    case "LIVE":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
    case "AMBER":
    case "AMBER_REVERIFY":
    case "AMBER_REPAIR":
    case "AMBER_SESSION":
      return "border-amber-300/40 bg-amber-300/10 text-amber-100";
    case "RED":
    case "QUARANTINE":
      return "border-red-400/40 bg-red-500/10 text-red-200";
    case "OPTIONAL_COVERED":
    case "OPTIONAL_MISSING":
      return "border-slate-500/40 bg-slate-500/10 text-slate-200";
    case "ADAPTER_MISSING":
      return "border-violet-400/40 bg-violet-500/10 text-violet-200";
    case "UNKNOWN":
    case "LOCKED":
    case "STALE":
    case "DRAFT":
    default:
      return "border-zinc-500/40 bg-zinc-500/10 text-zinc-200";
  }
}

/** Pastille statut : carré coloré + TEXTE du statut (jamais couleur seule). */
function StatusChip({ status }: { status: OperationalStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${statusChipClass(
        status
      )}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

/** true pour les statuts « verts » qui doivent exposer une preuve. */
function isGreen(status: OperationalStatus): boolean {
  return status === "GREEN" || status === "LIVE";
}

/** true pour les statuts qui doivent exposer un blocker. */
function isBlocked(status: OperationalStatus): boolean {
  return (
    status.startsWith("AMBER") ||
    status === "RED" ||
    status === "UNKNOWN" ||
    status === "ADAPTER_MISSING"
  );
}

/* ── ligne provider ──────────────────────────────────────────────── */

function ProviderRow({ item }: { item: AuthLedgerItem }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white">{item.name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            {item.category} · {item.statusSource}
          </p>
        </div>
        <StatusChip status={item.status} />
      </div>

      {isGreen(item.status) && item.proof ? (
        <p className="mt-1 text-[10.5px] leading-4 text-emerald-200/80">
          <span className="text-emerald-300/70">proof:</span> {item.proof}
        </p>
      ) : null}

      {isBlocked(item.status) && item.blocker ? (
        <p className="mt-1 text-[10.5px] leading-4 text-amber-200/80">
          <span className="text-amber-300/70">blocker:</span> {item.blocker}
        </p>
      ) : null}

      {item.coveredBy && item.coveredBy.length ? (
        <p className="mt-1 text-[10px] leading-4 text-slate-400">
          <span className="text-slate-500">covered by:</span>{" "}
          {item.coveredBy.join(", ")}
        </p>
      ) : null}

      {item.nextAction ? (
        <p className="mt-1 text-[10px] leading-4 text-cyan-200/80">
          <span className="text-cyan-300/70">next:</span> {item.nextAction}
        </p>
      ) : null}

      {item.greenCondition ? (
        <p className="mt-1 text-[10px] leading-4 text-slate-500">
          <span className="text-slate-600">green when:</span> {item.greenCondition}
        </p>
      ) : null}
    </div>
  );
}

/* ── section regroupée ───────────────────────────────────────────── */

function ProviderSection({
  title,
  items,
}: {
  title: string;
  items: AuthLedgerItem[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {title}
        </h3>
        <span className="rounded border border-slate-700/60 bg-slate-900/60 px-1.5 py-0.5 text-[9px] text-slate-400">
          {items.length}
        </span>
      </div>
      {items.length ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <ProviderRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-slate-600">aucun</p>
      )}
    </div>
  );
}

/* ── composant principal (pur, no data fetch) ────────────────────── */

export function AuthProviderStatusPanel() {
  const ledger = cofiatAuthProofLedger;
  const summary = summarizeStatuses(ledger);
  const { violations } = validateNoFalseGreen(ledger);
  const adapter = getConsoleIaAdapterState();

  // Buckets par criticité/statut (l'ordre du ledger est conservé dans chacun).
  const critical = ledger.filter((i) => isGreen(i.status));
  const reverify = ledger.filter((i) => i.status.startsWith("AMBER"));
  const optional = ledger.filter(
    (i) =>
      i.status === "OPTIONAL_COVERED" ||
      i.status === "OPTIONAL_MISSING" ||
      i.status === "ADAPTER_MISSING"
  );
  // « Present — not re-tested » : credentials présents (source=config) non re-testés.
  const presentNotRetested = reverify.filter((i) => i.statusSource === "config");
  // « Reverify » au sens strict : AMBER issus d'un audit (preuve périmée/session).
  const reverifyAudited = reverify.filter((i) => i.statusSource !== "config");

  const greenCount = (summary.GREEN ?? 0) + (summary.LIVE ?? 0);
  const amberCount =
    (summary.AMBER ?? 0) +
    (summary.AMBER_REVERIFY ?? 0) +
    (summary.AMBER_REPAIR ?? 0) +
    (summary.AMBER_SESSION ?? 0);
  const optionalCount =
    (summary.OPTIONAL_COVERED ?? 0) +
    (summary.OPTIONAL_MISSING ?? 0) +
    (summary.ADAPTER_MISSING ?? 0);
  const redCount = (summary.RED ?? 0) + (summary.QUARANTINE ?? 0);

  return (
    <div className="space-y-3">
      {/* (1) header + récap des compteurs */}
      <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
        <p className="text-xs font-semibold text-white">
          Auth / Providers — No-False-Green
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-semibold uppercase tracking-wide">
          <span className="rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-emerald-100">
            green/live {greenCount}
          </span>
          <span className="rounded border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 text-amber-100">
            amber {amberCount}
          </span>
          <span className="rounded border border-slate-500/40 bg-slate-500/10 px-1.5 py-0.5 text-slate-200">
            optional {optionalCount}
          </span>
          <span className="rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-red-200">
            red {redCount}
          </span>
          <span className="rounded border border-slate-700/60 bg-slate-900/60 px-1.5 py-0.5 text-slate-400">
            total {ledger.length}
          </span>
        </div>
      </div>

      {/* (4) NO-FALSE-GREEN VIOLATIONS — rouge si le guard détecte un faux-vert */}
      {violations.length ? (
        <div className="rounded-md border border-red-400/50 bg-red-500/10 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-200">
            ⚠ No-False-Green violations · {violations.length}
          </p>
          <ul className="mt-1.5 space-y-1">
            {violations.map((v) => (
              <li key={v.id} className="text-[10.5px] leading-4 text-red-200/90">
                <span className="font-semibold text-red-100">{v.id}</span> —{" "}
                {v.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-md border border-emerald-400/30 bg-emerald-400/5 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/80">
            ✓ No-False-Green: 0 violation — chaque GREEN/LIVE porte sa preuve
          </p>
        </div>
      )}

      {/* (2) sections groupées */}
      <ProviderSection title="Critical (GREEN/LIVE)" items={critical} />
      <ProviderSection title="Reverify (AMBER_*)" items={reverifyAudited} />
      <ProviderSection
        title="Optional covered / Adapter missing"
        items={optional}
      />
      <ProviderSection
        title="Present — not re-tested"
        items={presentNotRetested}
      />

      {/* (3) ligne Console IA adapter : provider résolu + statut + blocker */}
      <div className="rounded-md border border-violet-400/25 bg-violet-500/5 p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Console IA adapter
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-white">
              {adapter.provider}{" "}
              <span className="text-[10px] font-normal text-slate-500">
                · {adapter.statusSource}
              </span>
            </p>
          </div>
          <StatusChip status={adapter.status} />
        </div>
        {isGreen(adapter.status) && adapter.proof ? (
          <p className="mt-1 text-[10.5px] leading-4 text-emerald-200/80">
            <span className="text-emerald-300/70">proof:</span> {adapter.proof}
          </p>
        ) : null}
        {adapter.blocker ? (
          <p className="mt-1 text-[10.5px] leading-4 text-amber-200/80">
            <span className="text-amber-300/70">blocker:</span> {adapter.blocker}
          </p>
        ) : null}
        {adapter.fallbackChain && adapter.fallbackChain.length ? (
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            <span className="text-slate-600">fallback:</span>{" "}
            {adapter.fallbackChain.join(" → ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default AuthProviderStatusPanel;
