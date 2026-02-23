"use client";

import { useEffect, useState } from "react";
import { GitBranch, Layers } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { customFetch } from "@/api/mutator";
import type { StageConfig } from "./PipelineCanvas";

export type PipelineTemplate = {
  id: string;
  name: string;
  description: string;
  pipeline_type: string;
  stages: StageConfig[];
  trigger_config?: Record<string, unknown> | null;
};

const PIPELINE_TYPE_COLORS: Record<string, string> = {
  general: "bg-slate-50 text-slate-600",
  review_flow: "bg-purple-50 text-purple-700",
  release_flow: "bg-blue-50 text-blue-700",
  onboarding: "bg-green-50 text-green-700",
};

async function fetchTemplates(): Promise<PipelineTemplate[]> {
  try {
    const res = await customFetch<{ data: PipelineTemplate[] }>(
      "/api/v1/pipeline-templates",
      { method: "GET" },
    );
    return res.data ?? [];
  } catch {
    return [];
  }
}

function TemplateCard({
  template,
  onSelect,
}: {
  template: PipelineTemplate;
  onSelect: (template: PipelineTemplate) => void;
}) {
  const { t } = useTranslation();

  const typeColorClass =
    PIPELINE_TYPE_COLORS[template.pipeline_type] ?? "bg-slate-50 text-slate-600";

  return (
    <button
      onClick={() => onSelect(template)}
      className="w-full text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <Card className="h-full hover:-translate-y-0.5 hover:shadow-md transition-all">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-shrink-0 rounded-lg bg-slate-100 p-2 text-slate-500">
              <GitBranch className="h-5 w-5" />
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColorClass}`}
            >
              {t(
                `pipelines.types.${template.pipeline_type}` as Parameters<
                  typeof t
                >[0],
              ) ?? template.pipeline_type}
            </span>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-slate-900">
            {template.name}
          </h3>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 text-xs text-slate-500">
            {template.description}
          </p>
          <div className="mt-3 flex items-center gap-1 text-xs text-slate-400">
            <Layers className="h-3.5 w-3.5" />
            <span>
              {template.stages.length} {t("pipelines.columns.stages")}
            </span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

export function PipelineTemplateSelector({
  onSelect,
}: {
  onSelect: (template: PipelineTemplate) => void;
}) {
  const { t } = useTranslation();

  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    fetchTemplates()
      .then((data) => {
        if (!cancelled) {
          setTemplates(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : t("pipelines.templates.loadFailed"),
          );
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-40 animate-pulse rounded-2xl bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-500">{error}</p>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="py-8 text-center">
        <GitBranch className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">
          {t("pipelines.templates.noTemplates")}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {t("pipelines.templates.noTemplatesDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {t("pipelines.templates.selectPrompt")}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
