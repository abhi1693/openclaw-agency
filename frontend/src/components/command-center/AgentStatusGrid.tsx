"use client";

import { useTranslation } from "@/lib/i18n";

export type AgentStatusItem = {
  id: string;
  name: string;
  status: string;
  current_task_id: string | null;
  current_task_title: string | null;
  gateway_id: string;
  gateway_name: string | null;
  last_seen_at: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  provisioning: "bg-yellow-100 text-yellow-800",
  paused: "bg-slate-100 text-slate-700",
  retired: "bg-red-100 text-red-800",
  offline: "bg-slate-100 text-slate-500",
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const colorClass = STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700";
  const label =
    t(`commandCenter.status.${status}` as Parameters<typeof t>[0]) ?? status;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function AgentStatusGrid({ agents }: { agents: AgentStatusItem[] }) {
  const { t } = useTranslation();

  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        {t("commandCenter.noAgents")}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-left">
            <th className="px-4 py-3 font-medium text-slate-500">{t("common.name")}</th>
            <th className="px-4 py-3 font-medium text-slate-500">{t("common.status")}</th>
            <th className="px-4 py-3 font-medium text-slate-500">{t("commandCenter.currentTask")}</th>
            <th className="px-4 py-3 font-medium text-slate-500">{t("commandCenter.lastSeen")}</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{agent.name}</div>
                {agent.gateway_name ? (
                  <div className="text-xs text-slate-400">{agent.gateway_name}</div>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={agent.status} />
              </td>
              <td className="px-4 py-3 text-slate-600">
                {agent.current_task_title ?? (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {agent.last_seen_at
                  ? new Date(agent.last_seen_at).toLocaleString()
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
