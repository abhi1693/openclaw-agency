/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING — PROOF LEDGER PANEL (gardien de chantier, panneau droit)
 * ────────────────────────────────────────────────────────────────────
 * Fiche riche du Proof Ledger : verdict de chantier consolidé, violations
 * actionnables, contrats de travail, fichiers touchés, synchros, preuves
 * GREEN, NotebookLM, log console.IA + adapter. Couleur + TEXTE toujours.
 *
 * Autonome (comme AuthProviderStatusPanel) → montable dans un <Panel>.
 * Aucune donnée inventée : ce qui ne peut être validé côté client renvoie
 * explicitement vers le script CLI (no-false-green appliqué aux guards).
 *
 * source_tag: COFIAT_PROOF_LEDGER_PANEL_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

"use client";

import { useEffect, useState } from "react";
import { useCofiatProofLedger } from "@/hooks/useCofiatProofLedger";
import { ProofLedgerBadge } from "./ProofLedgerBadge";
import { WorkGuardStatus } from "./WorkGuardStatus";
import { validateCofiatPath } from "@/utils/cofiatPathGuard";
import { summarizeManifest } from "@/utils/cofiatChangeManifest";
import { cofiatWorkContracts } from "@/config/cofiatWorkContracts";
import {
  COFIAT_WORKER_POLICY,
  COFIAT_WORKER_POLICY_LABELS,
} from "@/config/cofiatCanonicalPaths";
import { cofiatAuthProofLedger } from "@/config/cofiatAuthProofLedger";
import { enforceNoFalseGreenAll } from "@/utils/cofiatNoFalseGreenGuard";
import { getConsoleIaAdapterState } from "@/config/cofiatConsoleIaAdapter";
import type { CofiatViolation, CofiatWorkerPolicy } from "@/types/cofiatProofLedger.types";

/** État live NotebookLM (réponse de /api/cofiatrading-world-control/notebooklm). */
type NblPack = { id: string; title: string; status: string; notebook_url?: string };
type NblState = {
  ok: boolean;
  status: string;
  rawStatus: string | null;
  packsTotal: number;
  packsSynced: number;
  packsAwaiting: number;
  packs: NblPack[];
  lastAuditUtc: string | null;
  staleDays: number | null;
  hubRole: string | null;
  deepLink: string;
  proof: string;
  blocker?: string;
  nextAction?: string;
};

type TabId =
  | "vue"
  | "violations"
  | "contracts"
  | "files"
  | "sync"
  | "green"
  | "notebook"
  | "console";

const TABS: { id: TabId; label: string }[] = [
  { id: "vue", label: "Vue" },
  { id: "violations", label: "Violations" },
  { id: "contracts", label: "Contrats" },
  { id: "files", label: "Files" },
  { id: "sync", label: "Sync" },
  { id: "green", label: "GREEN Proof" },
  { id: "notebook", label: "NotebookLM" },
  { id: "console", label: "console.IA" },
];

function sevClass(sev: CofiatViolation["severity"]): string {
  switch (sev) {
    case "block":
      return "border-red-400/45 bg-red-500/10 text-red-200";
    case "warn":
      return "border-amber-300/40 bg-amber-300/10 text-amber-100";
    case "info":
    default:
      return "border-violet-400/40 bg-violet-500/10 text-violet-200";
  }
}

function ViolationRow({ v }: { v: CofiatViolation }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[11px] font-semibold text-white">{v.message}</p>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${sevClass(
            v.severity
          )}`}
        >
          {v.severity}
        </span>
      </div>
      <p className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">
        {v.guard}
        {v.subject ? ` · ${v.subject}` : ""}
      </p>
      <p className="mt-1 text-[10px] leading-4 text-cyan-200/80">
        <span className="text-cyan-300/70">next:</span> {v.nextAction}
      </p>
    </div>
  );
}

export function ProofLedgerPanel() {
  const [tab, setTab] = useState<TabId>("vue");
  const { result, manifest, log } = useCofiatProofLedger();
  const summary = summarizeManifest(manifest);
  const adapter = getConsoleIaAdapterState();

  const inactiveGuards = result.guards.filter((g) => !g.active).length;
  const greenLedger = enforceNoFalseGreenAll(cofiatAuthProofLedger).filter(
    (i) => i.status === "GREEN" || i.status === "LIVE"
  );
  const notebookGuard = result.guards.find((g) => g.guard === "notebooklm-sync");

  // État NotebookLM LIVE (lecture réelle de l'index, source filesystem côté API).
  const [nbl, setNbl] = useState<NblState | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/notebooklm", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NblState | null) => {
        if (!cancelled) setNbl(d);
      })
      .catch(() => {
        if (!cancelled) setNbl(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      {/* Header : rôle + badge verdict */}
      <div className="rounded-md border border-emerald-400/25 bg-emerald-400/5 p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">Proof Ledger — gardien de chantier</p>
            <p className="mt-0.5 text-[10px] leading-4 text-slate-400">
              no-false-green · canonical work guard · {result.checkedAtLabel}
            </p>
          </div>
          <ProofLedgerBadge status={result.finalStatus} size="md" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-semibold uppercase tracking-wide">
          <span className="rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-red-200">
            block {result.blockingCount}
          </span>
          <span className="rounded border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 text-amber-100">
            warn {result.warningCount}
          </span>
          <span className="rounded border border-violet-400/40 bg-violet-500/10 px-1.5 py-0.5 text-violet-200">
            cli-pending {inactiveGuards}
          </span>
          <span className="rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-emerald-100">
            auth green {result.authGreen}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition ${
              tab === t.id
                ? "border-cyan-300/50 bg-cyan-400/10 text-cyan-100"
                : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── VUE ── */}
      {tab === "vue" ? (
        <div className="space-y-2">
          <WorkGuardStatus guards={result.guards} />
          <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Dernier manifest
            </p>
            <p className="mt-1 text-[11px] text-white">{manifest.summary}</p>
            <p className="mt-1 text-[10px] text-slate-500">
              worker {manifest.worker} · {summary.files} fichiers ({summary.created} créés,{" "}
              {summary.modified} modifiés) · contrat {manifest.workContractId}
            </p>
          </div>
          <PolicyBlock policy={COFIAT_WORKER_POLICY} />
        </div>
      ) : null}

      {/* ── VIOLATIONS ── */}
      {tab === "violations" ? (
        <div className="space-y-1.5">
          {result.violations.length ? (
            result.violations.map((v, i) => <ViolationRow key={`${v.guard}-${i}`} v={v} />)
          ) : (
            <p className="rounded-md border border-emerald-400/30 bg-emerald-400/5 p-2 text-[10px] text-emerald-200/80">
              ✓ 0 violation détectée — audit client
            </p>
          )}
        </div>
      ) : null}

      {/* ── CONTRACTS ── */}
      {tab === "contracts" ? (
        <div className="space-y-2">
          {cofiatWorkContracts.map((c) => (
            <div key={c.id} className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
              <p className="text-[11px] font-semibold text-white">{c.id}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {c.worker} · scope {c.scope} · {c.destructiveChangesAllowed ? "destructif OK" : "non destructif"}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-slate-300">{c.intent}</p>
              <p className="mt-1 text-[9px] text-emerald-200/70">allowed: {c.allowedPaths.length} chemins</p>
              <p className="text-[9px] text-red-200/70">forbidden: {c.forbiddenPaths.join(", ") || "—"}</p>
              <p className="text-[9px] text-cyan-200/70">sync requis: {c.requiredSyncTargets.join(", ")}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── FILES ── */}
      {tab === "files" ? (
        <div className="space-y-1.5">
          {manifest.touchedFiles.map((f) => {
            const chk = validateCofiatPath(f.path);
            return (
              <div key={f.path} className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-all text-[10.5px] text-white">{f.path}</p>
                  <span
                    className={`shrink-0 rounded border px-1 py-0.5 text-[8px] uppercase ${
                      chk.valid
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                        : "border-red-400/45 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {chk.valid ? "canon" : "hors-canon"}
                  </span>
                </div>
                <p className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                  {f.operation} · {f.ownerModule} · {chk.detectedScope ?? "?"}
                </p>
              </div>
            );
          })}
          <p className="text-[9px] text-violet-200/70">
            « importé/utilisé ? » : contrôlé par le Dead File Guard via scripts/validate-proof-ledger.ts (fs).
          </p>
        </div>
      ) : null}

      {/* ── SYNC ── */}
      {tab === "sync" ? (
        <div className="space-y-1.5">
          {manifest.syncTargets.map((s) => (
            <div key={s.target} className="flex items-start justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/70 p-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white">{s.target}</p>
                {s.reason ? <p className="mt-0.5 text-[10px] text-slate-500">{s.reason}</p> : null}
              </div>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] uppercase ${
                  s.status === "synced"
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                    : s.status === "pending"
                    ? "border-amber-300/40 bg-amber-300/10 text-amber-100"
                    : "border-red-400/45 bg-red-500/10 text-red-200"
                }`}
              >
                {s.status}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── GREEN PROOF ── */}
      {tab === "green" ? (
        <div className="space-y-1.5">
          {greenLedger.length ? (
            greenLedger.map((i) => (
              <div key={i.id} className="rounded-md border border-emerald-400/25 bg-emerald-400/5 p-2">
                <p className="text-[11px] font-semibold text-white">{i.name}</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                  {i.category} · {i.statusSource} · {i.status}
                </p>
                <p className="mt-1 text-[10px] leading-4 text-emerald-200/80">
                  <span className="text-emerald-300/70">proof:</span> {i.proof}
                </p>
              </div>
            ))
          ) : (
            <p className="text-[10px] text-slate-500">aucun GREEN/LIVE prouvé</p>
          )}
        </div>
      ) : null}

      {/* ── NOTEBOOKLM (live, lu via /api/…/notebooklm) ── */}
      {tab === "notebook" ? (
        <div className="space-y-2">
          {nbl === null ? (
            <p className="text-[10px] text-slate-500">Chargement de l&apos;état NotebookLM…</p>
          ) : !nbl.ok ? (
            <div className="rounded-md border border-amber-300/30 bg-amber-300/5 p-2">
              <p className="text-[11px] font-semibold text-white">NotebookLM — index indisponible</p>
              {nbl.blocker ? <p className="mt-1 text-[10px] text-amber-200/80">blocker: {nbl.blocker}</p> : null}
              {nbl.nextAction ? <p className="mt-1 text-[10px] text-cyan-200/80">next: {nbl.nextAction}</p> : null}
            </div>
          ) : (
            <>
              <div className="rounded-md border border-cyan-300/25 bg-cyan-400/5 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-white">Google NotebookLM</p>
                    <p className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                      {nbl.hubRole ?? "index live"} · filesystem
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${
                      nbl.status === "LIVE"
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                        : nbl.status.startsWith("AMBER")
                        ? "border-amber-300/40 bg-amber-300/10 text-amber-100"
                        : "border-zinc-500/40 bg-zinc-500/10 text-zinc-200"
                    }`}
                  >
                    {nbl.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-semibold uppercase tracking-wide">
                  <span className="rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-emerald-100">
                    notebooks {nbl.packsSynced}/{nbl.packsTotal}
                  </span>
                  <span className="rounded border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 text-amber-100">
                    à créer {nbl.packsAwaiting}
                  </span>
                  {nbl.staleDays !== null ? (
                    <span className="rounded border border-slate-600/50 bg-slate-800/60 px-1.5 py-0.5 text-slate-300">
                      audit J-{nbl.staleDays}
                    </span>
                  ) : null}
                </div>
                {nbl.blocker ? (
                  <p className="mt-1 text-[10px] leading-4 text-amber-200/80">
                    <span className="text-amber-300/70">blocker:</span> {nbl.blocker}
                  </p>
                ) : null}
                {nbl.nextAction ? (
                  <p className="mt-1 text-[10px] leading-4 text-cyan-200/80">
                    <span className="text-cyan-300/70">next:</span> {nbl.nextAction}
                  </p>
                ) : null}
                <a
                  href={nbl.deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded border border-cyan-300/50 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
                >
                  Ouvrir NotebookLM ↗
                </a>
              </div>
              <div className="grid gap-1.5">
                {nbl.packs.map((p) => (
                  <div key={p.id} className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-[10.5px] text-white">{p.title || p.id}</p>
                      <span
                        className={`shrink-0 rounded border px-1 py-0.5 text-[8px] uppercase ${
                          p.status === "created" || p.status === "synced"
                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                            : "border-amber-300/40 bg-amber-300/10 text-amber-100"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    {p.notebook_url ? (
                      <a href={p.notebook_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[9px] text-cyan-300/80 hover:underline">
                        notebook ↗
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
          {notebookGuard?.violations.map((v, i) => <ViolationRow key={i} v={v} />)}
        </div>
      ) : null}

      {/* ── CONSOLE.IA ── */}
      {tab === "console" ? (
        <div className="space-y-2">
          <div className="rounded-md border border-violet-400/25 bg-violet-500/5 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Adapter Console IA
            </p>
            <p className="mt-0.5 text-xs font-semibold text-white">
              {adapter.provider} <span className="text-[10px] font-normal text-slate-500">· {adapter.status}</span>
            </p>
            {adapter.blocker ? (
              <p className="mt-1 text-[10px] leading-4 text-amber-200/80">
                <span className="text-amber-300/70">blocker:</span> {adapter.blocker}
              </p>
            ) : null}
            <p className="mt-1 text-[9px] text-slate-500">fallback: {adapter.fallbackChain.join(" → ")}</p>
          </div>
          <div className="rounded-md border border-slate-800 bg-black/60 p-2 font-mono text-[10px] leading-4 text-slate-300">
            {log.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PolicyBlock({ policy }: { policy: CofiatWorkerPolicy }) {
  const keys = Object.keys(policy) as (keyof CofiatWorkerPolicy)[];
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        Policy worker (opposable à tous)
      </p>
      <div className="mt-1.5 grid grid-cols-1 gap-1">
        {keys.map((k) => (
          <div key={k} className="flex items-center gap-1.5 text-[10px] leading-4">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                policy[k] ? "bg-emerald-400" : "bg-slate-600"
              }`}
            />
            <span className="text-slate-300">{COFIAT_WORKER_POLICY_LABELS[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProofLedgerPanel;
