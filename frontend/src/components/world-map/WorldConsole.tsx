"use client";

/**
 * WorldConsole — control console bound to the map. Shows the selected entity
 * (type, status, role, metrics, members, relation), exposes its actions, and
 * streams the live event log. Updates on every map interaction via the store.
 */

import { STATUS_TOKEN } from "./config/worldAssets";
import { useWorldConsole, type ConsoleAction } from "./hooks/useWorldConsole";
import type { WorldEntityStatus } from "./types/worldMap.types";

const ACTION_LABEL: Record<ConsoleAction, string> = {
  focus: "Focus",
  showLinkedHouse: "Voir la maison",
  triggerAlert: "Déclencher alerte",
  resetStatus: "Réinitialiser",
  showTelemetry: "Télémétrie",
};

function StatusBadge({ status }: { status?: WorldEntityStatus }) {
  if (!status) return null;
  const token = STATUS_TOKEN[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color: token.color, backgroundColor: `${token.color}1f`, border: `1px solid ${token.color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: token.color }} />
      {token.label}
    </span>
  );
}

export function WorldConsole() {
  const { descriptor, logs, runAction, selectMember, clear, telemetrySource } = useWorldConsole();

  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-700/50 bg-slate-950/70 backdrop-blur">
      <header className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">World Console</h2>
        </div>
        {descriptor ? (
          <button type="button" onClick={clear} className="text-[11px] text-slate-400 transition hover:text-white">
            Effacer
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {descriptor ? (
          <div className="space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{descriptor.typeLabel}</div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-white">{descriptor.name}</h3>
                <StatusBadge status={descriptor.status} />
              </div>
              {descriptor.role ? <p className="mt-1 text-xs text-slate-400">{descriptor.role}</p> : null}
              <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-400">
                {descriptor.homeName ? <p>Maison · <span className="text-slate-200">{descriptor.homeName}</span></p> : null}
                {descriptor.zoneName ? <p>Zone · <span className="text-slate-200">{descriptor.zoneName}</span></p> : null}
                {descriptor.relation ? (
                  <p>
                    <span className="text-slate-200">{descriptor.relation.fromName}</span> →{" "}
                    <span className="text-slate-200">{descriptor.relation.toName}</span>
                  </p>
                ) : null}
              </div>
            </div>

            {/* metrics */}
            <div className="grid grid-cols-2 gap-2">
              {descriptor.metrics.map((m) => (
                <div key={m.label} className="rounded-lg border border-slate-700/40 bg-slate-900/50 px-2.5 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{m.label}</div>
                  <div className="text-sm font-semibold tabular-nums text-slate-100">{m.value}</div>
                </div>
              ))}
            </div>

            {/* members */}
            {descriptor.members && descriptor.members.length > 0 ? (
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">{descriptor.membersLabel}</div>
                <ul className="space-y-1">
                  {descriptor.members.map((member) => {
                    const token = member.status ? STATUS_TOKEN[member.status] : null;
                    return (
                      <li key={member.id}>
                        <button
                          type="button"
                          onClick={() => selectMember(member)}
                          className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1 text-left transition hover:border-slate-600/50 hover:bg-slate-800/40"
                        >
                          <span className="flex items-center gap-2 truncate">
                            {token ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: token.color }} /> : null}
                            <span className="truncate text-xs text-slate-200">{member.name}</span>
                          </span>
                          <span className="shrink-0 truncate text-[10px] text-slate-500">{member.sub}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* actions */}
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">Actions</div>
              <div className="flex flex-wrap gap-1.5">
                {descriptor.actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => runAction(action)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                      action === "triggerAlert"
                        ? "border-rose-400/40 text-rose-200 hover:bg-rose-400/10"
                        : "border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10"
                    }`}
                  >
                    {ACTION_LABEL[action]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-2 text-3xl opacity-30">◉</div>
            <p className="text-sm text-slate-400">Aucune entité sélectionnée</p>
            <p className="mt-1 text-xs text-slate-600">Clique un agent, une maison, une zone ou un lien sur la carte.</p>
          </div>
        )}
      </div>

      {/* logs */}
      <div className="border-t border-slate-700/50 px-4 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Logs</span>
          <span className="text-[9px] uppercase tracking-wide text-slate-600">flux {telemetrySource}</span>
        </div>
        <ul className="max-h-28 space-y-0.5 overflow-y-auto font-mono text-[10px] leading-relaxed">
          {logs.length === 0 ? (
            <li className="text-slate-600">En attente d&apos;événements…</li>
          ) : (
            logs.map((log) => (
              <li key={log.id} className="flex gap-2 text-slate-400">
                <span className="shrink-0 text-slate-600">[{log.time}]</span>
                <span className="truncate">{log.label}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
