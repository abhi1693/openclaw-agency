"use client";

import { Activity, Server, TrendingUp, Users } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export type CommandCenterOverview = {
  active_agents: number;
  tasks_today: number;
  throughput_7d: number;
  gateways_online: number;
  generated_at: string;
};

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <div className="rounded-lg bg-blue-50 p-2 text-blue-600">{icon}</div>
      </div>
      <h3 className="font-heading text-3xl font-bold text-slate-900">{value}</h3>
    </div>
  );
}

export function CommandCenterKPIs({
  overview,
}: {
  overview: CommandCenterOverview;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label={t("commandCenter.activeAgents")}
        value={overview.active_agents}
        icon={<Users className="h-4 w-4" />}
      />
      <KpiCard
        label={t("commandCenter.tasksToday")}
        value={overview.tasks_today}
        icon={<Activity className="h-4 w-4" />}
      />
      <KpiCard
        label={t("commandCenter.throughput7d")}
        value={overview.throughput_7d}
        icon={<TrendingUp className="h-4 w-4" />}
      />
      <KpiCard
        label={t("commandCenter.gatewaysOnline")}
        value={overview.gateways_online}
        icon={<Server className="h-4 w-4" />}
      />
    </div>
  );
}
