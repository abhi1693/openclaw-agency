"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { PipelinesTable } from "@/components/pipelines/PipelinesTable";
import type { PipelineRead } from "@/components/pipelines/PipelinesTable";

import { customFetch } from "@/api/mutator";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const PIPELINES_QUERY_KEY = ["pipelines"];

async function fetchPipelines(): Promise<PipelineRead[]> {
  const res = await customFetch<{ data: PipelineRead[] }>("/api/v1/pipelines", {
    method: "GET",
  });
  return res.data ?? [];
}

async function deletePipeline(pipelineId: string): Promise<void> {
  await customFetch(`/api/v1/pipelines/${pipelineId}`, { method: "DELETE" });
}

async function startRun(pipelineId: string): Promise<void> {
  await customFetch(`/api/v1/pipelines/${pipelineId}/run`, {
    method: "POST",
    body: JSON.stringify({ input_data: null }),
  });
}

export default function PipelinesPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const [deleteTarget, setDeleteTarget] = useState<PipelineRead | null>(null);

  const pipelinesQuery = useQuery({
    queryKey: PIPELINES_QUERY_KEY,
    queryFn: fetchPipelines,
    enabled: Boolean(isSignedIn && isAdmin),
    refetchInterval: 30_000,
  });

  const pipelines = pipelinesQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (pipelineId: string) => deletePipeline(pipelineId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PIPELINES_QUERY_KEY });
      setDeleteTarget(null);
    },
  });

  const runMutation = useMutation({
    mutationFn: (pipelineId: string) => startRun(pipelineId),
    onSuccess: (_data, pipelineId) => {
      router.push(`/pipelines/${pipelineId}`);
    },
  });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  };

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: t("pipelines.signInPrompt"),
          forceRedirectUrl: "/pipelines",
          signUpForceRedirectUrl: "/pipelines",
        }}
        title={t("pipelines.title")}
        description={`${pipelines.length} ${t("pipelines.countSummary")}.`}
        headerActions={
          <Button onClick={() => router.push("/pipelines/new")}>
            {t("pipelines.newPipeline")}
          </Button>
        }
        isAdmin={isAdmin}
        adminOnlyMessage={t("pipelines.adminOnly")}
        stickyHeader
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <PipelinesTable
            pipelines={pipelines}
            isLoading={pipelinesQuery.isLoading}
            onEdit={(p) => router.push(`/pipelines/${p.id}/edit`)}
            onDelete={setDeleteTarget}
            onRun={(p) => runMutation.mutate(p.id)}
          />
        </div>

        {pipelinesQuery.error ? (
          <p className="mt-4 text-sm text-red-500">
            {pipelinesQuery.error instanceof Error
              ? pipelinesQuery.error.message
              : "Failed to load pipelines."}
          </p>
        ) : null}
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        ariaLabel={t("pipelines.deletePipeline")}
        title={t("pipelines.deletePipeline")}
        description={<>{t("pipelines.deleteConfirm")}</>}
        errorMessage={
          deleteMutation.error instanceof Error
            ? deleteMutation.error.message
            : undefined
        }
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
