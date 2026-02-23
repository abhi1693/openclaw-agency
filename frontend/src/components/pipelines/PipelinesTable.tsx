"use client";

import { GitBranch } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

export type PipelineRead = {
  id: string;
  organization_id: string;
  board_id: string | null;
  name: string;
  description: string | null;
  pipeline_type: string;
  stages: Array<{
    id: string;
    name: string;
    type: string;
    config: Record<string, unknown>;
    next_stage_id?: string | null;
    condition?: Record<string, unknown> | null;
  }>;
  trigger_config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const PIPELINE_TYPE_COLORS: Record<string, string> = {
  general: "bg-slate-50 text-slate-600",
  review_flow: "bg-purple-50 text-purple-700",
  release_flow: "bg-blue-50 text-blue-700",
  onboarding: "bg-green-50 text-green-700",
};

export function PipelinesTable({
  pipelines,
  isLoading,
  onEdit,
  onDelete,
  onRun,
}: {
  pipelines: PipelineRead[];
  isLoading: boolean;
  onEdit?: (pipeline: PipelineRead) => void;
  onDelete?: (pipeline: PipelineRead) => void;
  onRun?: (pipeline: PipelineRead) => void;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-2 p-6">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-12 animate-pulse rounded-lg bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="p-8 text-center">
        <GitBranch className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">
          {t("pipelines.noPipelines")}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {t("pipelines.noPipelinesDesc")}
        </p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-left">
          <th className="px-4 py-3 font-medium text-slate-500">
            {t("pipelines.columns.name")}
          </th>
          <th className="px-4 py-3 font-medium text-slate-500">
            {t("pipelines.columns.type")}
          </th>
          <th className="px-4 py-3 font-medium text-slate-500">
            {t("pipelines.columns.stages")}
          </th>
          <th className="px-4 py-3 font-medium text-slate-500">
            {t("pipelines.columns.status")}
          </th>
          <th className="px-4 py-3 font-medium text-slate-500">
            {t("common.actions")}
          </th>
        </tr>
      </thead>
      <tbody>
        {pipelines.map((pipeline) => {
          const typeColorClass =
            PIPELINE_TYPE_COLORS[pipeline.pipeline_type] ??
            "bg-slate-50 text-slate-600";

          return (
            <tr
              key={pipeline.id}
              className="border-b border-slate-50 hover:bg-slate-50"
            >
              <td className="px-4 py-3">
                <span className="font-medium text-slate-900">
                  {pipeline.name}
                </span>
                {pipeline.description ? (
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                    {pipeline.description}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColorClass}`}
                >
                  {t(
                    `pipelines.types.${pipeline.pipeline_type}` as Parameters<
                      typeof t
                    >[0],
                  ) ?? pipeline.pipeline_type}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {pipeline.stages.length}
              </td>
              <td className="px-4 py-3">
                <Badge variant={pipeline.is_active ? "success" : "default"}>
                  {pipeline.is_active
                    ? t("pipelines.active")
                    : t("pipelines.inactive")}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {onRun ? (
                    <button
                      onClick={() => onRun(pipeline)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {t("pipelines.run")}
                    </button>
                  ) : null}
                  {onEdit ? (
                    <button
                      onClick={() => onEdit(pipeline)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {t("common.edit")}
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button
                      onClick={() => onDelete(pipeline)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      {t("common.delete")}
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
