"use client";

import { Bot, CheckSquare, Hand, Webhook, GitBranch } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

type StageType = "ai_task" | "approval" | "manual" | "webhook" | "condition";

type StageStatus = "running" | "completed" | "failed" | "waiting" | "paused";

export type PipelineStage = {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  next_stage_id?: string | null;
};

const STAGE_ICONS: Record<StageType, React.ComponentType<{ className?: string }>> = {
  ai_task: Bot,
  approval: CheckSquare,
  manual: Hand,
  webhook: Webhook,
  condition: GitBranch,
};

const STATUS_BADGE_VARIANTS: Record<
  StageStatus,
  "default" | "success" | "danger" | "warning" | "accent" | "outline"
> = {
  running: "accent",
  completed: "success",
  failed: "danger",
  waiting: "default",
  paused: "warning",
};

function getConfigSummary(config: Record<string, unknown>): string {
  const entries = Object.entries(config);
  if (entries.length === 0) return "";
  const [key, value] = entries[0];
  const valueStr =
    typeof value === "string"
      ? value
      : typeof value === "number"
        ? String(value)
        : JSON.stringify(value);
  const truncated = valueStr.length > 40 ? `${valueStr.slice(0, 40)}…` : valueStr;
  return `${key}: ${truncated}`;
}

export function PipelineStageCard({
  stage,
  isActive,
  status,
}: {
  stage: PipelineStage;
  isActive?: boolean;
  status?: string;
}) {
  const { t } = useTranslation();

  const stageType = stage.type as StageType;
  const StageIcon = STAGE_ICONS[stageType] ?? GitBranch;
  const configSummary = getConfigSummary(stage.config);
  const stageStatus = status as StageStatus | undefined;

  const cardBorderClass = isActive
    ? "border-blue-300 bg-blue-50"
    : "border-slate-200 bg-white";

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition-colors ${cardBorderClass}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 rounded-lg p-2 ${
            isActive ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
          }`}
        >
          <StageIcon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-slate-900">
              {stage.name}
            </span>
            {stageStatus ? (
              <Badge variant={STATUS_BADGE_VARIANTS[stageStatus] ?? "default"}>
                {t(
                  `pipelines.stageStatus.${stageStatus}` as Parameters<
                    typeof t
                  >[0],
                ) ?? stageStatus}
              </Badge>
            ) : null}
          </div>

          <p className="mt-0.5 text-xs text-slate-500">
            {t(
              `pipelines.stageTypes.${stage.type}` as Parameters<typeof t>[0],
            ) ?? stage.type}
          </p>

          {configSummary ? (
            <p className="mt-1 line-clamp-1 text-xs text-slate-400">
              {configSummary}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
