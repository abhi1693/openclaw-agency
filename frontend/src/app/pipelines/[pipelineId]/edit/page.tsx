"use client";

export const dynamic = "force-dynamic";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { PipelineCanvas } from "@/components/pipelines/PipelineCanvas";
import type { StageConfig } from "@/components/pipelines/PipelineCanvas";
import type { PipelineRead } from "@/components/pipelines/PipelinesTable";

import { customFetch } from "@/api/mutator";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useQuery, useMutation } from "@tanstack/react-query";

const PIPELINE_TYPES = [
  "general",
  "review_flow",
  "release_flow",
  "onboarding",
] as const;

type PipelineType = (typeof PIPELINE_TYPES)[number];

type Params = Promise<{ pipelineId: string }>;

async function fetchPipeline(pipelineId: string): Promise<PipelineRead> {
  const res = await customFetch<{ data: PipelineRead }>(
    `/api/v1/pipelines/${pipelineId}`,
    { method: "GET" },
  );
  return res.data;
}

async function updatePipeline(
  pipelineId: string,
  payload: Partial<PipelineRead>,
): Promise<PipelineRead> {
  const res = await customFetch<{ data: PipelineRead }>(
    `/api/v1/pipelines/${pipelineId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
  return res.data;
}

export default function EditPipelinePage({ params }: { params: Params }) {
  const { pipelineId } = use(params);
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pipelineType, setPipelineType] = useState<PipelineType>("general");
  const [stages, setStages] = useState<StageConfig[]>([]);
  const [isActive, setIsActive] = useState(true);

  const pipelineQuery = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => fetchPipeline(pipelineId),
    enabled: Boolean(isSignedIn && isAdmin),
  });

  useEffect(() => {
    const data = pipelineQuery.data;
    if (!data) return;
    setName(data.name);
    setDescription(data.description ?? "");
    setPipelineType((data.pipeline_type as PipelineType) ?? "general");
    setStages(data.stages as StageConfig[]);
    setIsActive(data.is_active);
  }, [pipelineQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<PipelineRead>) =>
      updatePipeline(pipelineId, payload),
    onSuccess: () => {
      router.push(`/pipelines/${pipelineId}`);
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      pipeline_type: pipelineType,
      stages: stages as PipelineRead["stages"],
      is_active: isActive,
    });
  };

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("pipelines.signInPrompt"),
        forceRedirectUrl: `/pipelines/${pipelineId}/edit`,
        signUpForceRedirectUrl: `/pipelines/${pipelineId}/edit`,
      }}
      title={`${t("common.edit")} — ${pipelineQuery.data?.name ?? "…"}`}
      description={t("pipelines.description")}
      isAdmin={isAdmin}
      adminOnlyMessage={t("pipelines.adminOnly")}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Basic fields */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t("common.name")}
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t("pipelines.columns.type")}
              </label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                value={pipelineType}
                onChange={(e) =>
                  setPipelineType(e.target.value as PipelineType)
                }
              >
                {PIPELINE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`pipelines.types.${type}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t("common.noDescription")}
              </label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <label
                htmlFor="is-active"
                className="text-sm font-medium text-slate-700"
              >
                {t("pipelines.active")}
              </label>
            </div>
          </div>
        </div>

        {/* Stage canvas */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            {t("pipelines.columns.stages")}
          </h2>
          <PipelineCanvas stages={stages} onChange={setStages} />
        </div>

        {updateMutation.error instanceof Error ? (
          <p className="text-sm text-red-500">
            {updateMutation.error.message}
          </p>
        ) : null}

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/pipelines/${pipelineId}`)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || updateMutation.isPending}
          >
            {updateMutation.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </DashboardPageLayout>
  );
}
