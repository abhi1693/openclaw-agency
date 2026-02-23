"use client";

export const dynamic = "force-dynamic";

import { use } from "react";
import Link from "next/link";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PipelineRunTimeline } from "@/components/pipelines/PipelineRunTimeline";
import type { PipelineRead } from "@/components/pipelines/PipelinesTable";
import type { PipelineRunRead } from "@/components/pipelines/PipelineRunTimeline";

import { customFetch } from "@/api/mutator";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Params = Promise<{ pipelineId: string }>;

async function fetchPipeline(pipelineId: string): Promise<PipelineRead> {
  const res = await customFetch<{ data: PipelineRead }>(
    `/api/v1/pipelines/${pipelineId}`,
    { method: "GET" },
  );
  return res.data;
}

async function fetchRuns(pipelineId: string): Promise<PipelineRunRead[]> {
  const res = await customFetch<{ data: PipelineRunRead[] }>(
    `/api/v1/pipelines/${pipelineId}/runs`,
    { method: "GET" },
  );
  return res.data ?? [];
}

async function startRun(pipelineId: string): Promise<PipelineRunRead> {
  const res = await customFetch<{ data: PipelineRunRead }>(
    `/api/v1/pipelines/${pipelineId}/run`,
    {
      method: "POST",
      body: JSON.stringify({ input_data: null }),
    },
  );
  return res.data;
}

export default function PipelineDetailPage({ params }: { params: Params }) {
  const { pipelineId } = use(params);
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const pipelineQueryKey = ["pipeline", pipelineId];
  const runsQueryKey = ["pipeline-runs", pipelineId];

  const pipelineQuery = useQuery({
    queryKey: pipelineQueryKey,
    queryFn: () => fetchPipeline(pipelineId),
    enabled: Boolean(isSignedIn && isAdmin),
  });

  const runsQuery = useQuery({
    queryKey: runsQueryKey,
    queryFn: () => fetchRuns(pipelineId),
    enabled: Boolean(isSignedIn && isAdmin),
    refetchInterval: 10_000,
  });

  const runMutation = useMutation({
    mutationFn: () => startRun(pipelineId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: runsQueryKey });
    },
  });

  const pipeline = pipelineQuery.data;
  const runs = runsQuery.data ?? [];

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("pipelines.signInPrompt"),
        forceRedirectUrl: `/pipelines/${pipelineId}`,
        signUpForceRedirectUrl: `/pipelines/${pipelineId}`,
      }}
      title={pipeline?.name ?? "…"}
      description={pipeline?.description ?? ""}
      headerActions={
        pipeline ? (
          <div className="flex items-center gap-2">
            <Link href={`/pipelines/${pipelineId}/edit`}>
              <Button variant="outline" size="sm">
                {t("common.edit")}
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => runMutation.mutate()}
              disabled={!pipeline.is_active || runMutation.isPending}
            >
              {runMutation.isPending ? t("common.saving") : t("pipelines.run")}
            </Button>
          </div>
        ) : null
      }
      isAdmin={isAdmin}
      adminOnlyMessage={t("pipelines.adminOnly")}
      stickyHeader
    >
      {pipeline ? (
        <div className="space-y-6">
          {/* Pipeline metadata */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  {t("pipelines.columns.type")}
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {t(
                    `pipelines.types.${pipeline.pipeline_type}` as Parameters<
                      typeof t
                    >[0],
                  ) ?? pipeline.pipeline_type}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  {t("pipelines.columns.stages")}
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {pipeline.stages.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  {t("pipelines.columns.status")}
                </dt>
                <dd className="mt-1">
                  <Badge variant={pipeline.is_active ? "success" : "default"}>
                    {pipeline.is_active
                      ? t("pipelines.active")
                      : t("pipelines.inactive")}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  {t("common.created")}
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {new Date(pipeline.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          {runMutation.error instanceof Error ? (
            <p className="text-sm text-red-500">{runMutation.error.message}</p>
          ) : null}

          {/* Run history */}
          <div>
            <h2 className="mb-4 text-sm font-semibold text-slate-900">
              {t("pipelines.runId")}
            </h2>
            {runsQuery.isLoading ? (
              <div className="text-sm text-slate-500">{t("common.loading")}</div>
            ) : runs.length === 0 ? (
              <p className="text-sm text-slate-400">{t("pipelines.noStages")}</p>
            ) : (
              <div className="space-y-4">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <PipelineRunTimeline pipeline={pipeline} run={run} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : pipelineQuery.isLoading ? (
        <div className="text-sm text-slate-500">{t("common.loading")}</div>
      ) : (
        <div className="text-sm text-red-500">Pipeline not found.</div>
      )}
    </DashboardPageLayout>
  );
}
