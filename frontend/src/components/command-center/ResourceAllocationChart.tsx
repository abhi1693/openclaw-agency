"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "@/lib/i18n";

export type ResourceAllocationItem = {
  agent_id: string;
  agent_name: string;
  tasks_assigned: number;
  tasks_in_progress: number;
  tasks_done_today: number;
  estimated_hours: number;
};

export function ResourceAllocationChart({
  data,
}: {
  data: ResourceAllocationItem[];
}) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        {t("commandCenter.noAllocation")}
      </div>
    );
  }

  const chartData = data.map((item) => ({
    name:
      item.agent_name.length > 12
        ? `${item.agent_name.slice(0, 12)}…`
        : item.agent_name,
    [t("commandCenter.tasksAssigned")]: item.tasks_assigned,
    [t("commandCenter.tasksInProgress")]: item.tasks_in_progress,
    [t("commandCenter.tasksDoneToday")]: item.tasks_done_today,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ left: 0, right: 12 }}>
        <CartesianGrid vertical={false} stroke="#e2e8f0" />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          width={32}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            fontSize: "12px",
          }}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ paddingTop: "8px", fontSize: "12px" }}
        />
        <Bar
          dataKey={t("commandCenter.tasksAssigned")}
          fill="#bfdbfe"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey={t("commandCenter.tasksInProgress")}
          fill="#2563eb"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey={t("commandCenter.tasksDoneToday")}
          fill="#16a34a"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
