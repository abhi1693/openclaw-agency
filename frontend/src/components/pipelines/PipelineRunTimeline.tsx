"use client";

import { Check, X } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import type { PipelineRead } from "./PipelinesTable";

export type PipelineRunRead = {
  id: string;
  pipeline_id: string;
  organization_id: string;
  input_data: Record<string, unknown> | null;
  current_stage_id: string | null;
  status: string;
  stage_results: Record<
    string,
    {
      status: string;
      started_at?: string;
      completed_at?: string;
      output?: unknown;
      error?: string;
    }
  >;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RunStatus = "running" | "paused" | "completed" | "failed" | "cancelled";

const RUN_STATUS_BADGE_VARIANTS: Record<
  RunStatus,
  "default" | "success" | "danger" | "warning" | "accent" | "outline"
> = {
  running: "accent",
  paused: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "outline",
};

type StageResult = {
  status: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
};

function StageIndicator({
  stageResult,
  isCurrent,
}: {
  stageResult: StageResult | undefined;
  isCurrent: boolean;
}) {
  if (!stageResult) {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-200 bg-white" />
    );
  }

  if (stageResult.status === "completed") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500">
        <Check className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }

  if (stageResult.status === "failed") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500">
        <X className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }

  if (stageResult.status === "running" || isCurrent) {
    return (
      <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-blue-500">
        <div className="absolute h-full w-full animate-ping rounded-full bg-blue-400 opacity-50" />
        <div className="h-2.5 w-2.5 rounded-full bg-white" />
      </div>
    );
  }

  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-200 bg-white" />
  );
}

function formatTime(isoString: string | undefined): string {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function PipelineRunTimeline({
  pipeline,
  run,
}: {
  pipeline: PipelineRead;
  run: PipelineRunRead;
}) {
  const { t } = useTranslation();

  const runStatus = run.status as RunStatus;
  const badgeVariant = RUN_STATUS_BADGE_VARIANTS[runStatus] ?? "default";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {pipeline.name}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {t("pipelines.runId")}: {run.id.slice(0, 8)}
          </p>
        </div>
        <Badge variant={badgeVariant}>
          {t(
            `pipelines.runStatus.${run.status}` as Parameters<typeof t>[0],
          ) ?? run.status}
        </Badge>
      </div>

      {pipeline.stages.length === 0 ? (
        <p className="text-sm text-slate-400">{t("pipelines.noStages")}</p>
      ) : (
        <div className="relative">
          {pipeline.stages.map((stage, index) => {
            const stageResult = run.stage_results[stage.id];
            const isCurrent = run.current_stage_id === stage.id;
            const isLast = index === pipeline.stages.length - 1;
            const stageStatus = stageResult?.status ?? "pending";

            return (
              <div key={stage.id} className="relative flex gap-4">
                {/* Vertical connector line */}
                {!isLast ? (
                  <div className="absolute left-3 top-7 h-full w-0.5 bg-slate-200" />
                ) : null}

                {/* Indicator */}
                <div className="relative z-10 flex-shrink-0">
                  <StageIndicator
                    stageResult={stageResult}
                    isCurrent={isCurrent}
                  />
                </div>

                {/* Stage content */}
                <div className={`pb-6 min-w-0 flex-1 ${isLast ? "pb-0" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-medium ${
                        isCurrent ? "text-blue-700" : "text-slate-900"
                      }`}
                    >
                      {stage.name}
                    </span>
                    {stageResult ? (
                      <span
                        className={`text-xs font-medium ${
                          stageStatus === "completed"
                            ? "text-green-600"
                            : stageStatus === "failed"
                              ? "text-red-600"
                              : stageStatus === "running"
                                ? "text-blue-600"
                                : "text-slate-400"
                        }`}
                      >
                        {t(
                          `pipelines.stageStatus.${stageStatus}` as Parameters<
                            typeof t
                          >[0],
                        ) ?? stageStatus}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {t("pipelines.stageStatus.pending")}
                      </span>
                    )}
                  </div>

                  {stageResult?.started_at ? (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {t("pipelines.startedAt")}:{" "}
                      {formatTime(stageResult.started_at)}
                      {stageResult.completed_at
                        ? ` — ${formatTime(stageResult.completed_at)}`
                        : ""}
                    </p>
                  ) : null}

                  {stageResult?.error ? (
                    <p className="mt-1 line-clamp-2 text-xs text-red-500">
                      {stageResult.error}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
