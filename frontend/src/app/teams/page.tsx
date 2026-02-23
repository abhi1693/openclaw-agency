"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { TeamsTable } from "@/components/teams/TeamsTable";
import type { AgentTeamRead } from "@/components/teams/TeamCard";

import { customFetch } from "@/api/mutator";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const TEAMS_QUERY_KEY = ["agent-teams"];

async function fetchTeams(): Promise<AgentTeamRead[]> {
  const res = await customFetch<{ data: AgentTeamRead[] }>("/api/v1/agent-teams", {
    method: "GET",
  });
  return res.data ?? [];
}

async function deleteTeam(teamId: string): Promise<void> {
  await customFetch(`/api/v1/agent-teams/${teamId}`, { method: "DELETE" });
}

export default function TeamsPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const [deleteTarget, setDeleteTarget] = useState<AgentTeamRead | null>(null);

  const teamsQuery = useQuery({
    queryKey: TEAMS_QUERY_KEY,
    queryFn: fetchTeams,
    enabled: Boolean(isSignedIn && isAdmin),
    refetchInterval: 30_000,
  });

  const teams = teamsQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (teamId: string) => deleteTeam(teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY });
      setDeleteTarget(null);
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
          message: t("teams.signInPrompt"),
          forceRedirectUrl: "/teams",
          signUpForceRedirectUrl: "/teams",
        }}
        title={t("teams.title")}
        description={`${teams.length} ${t("teams.countSummary")}.`}
        headerActions={
          <Button onClick={() => router.push("/teams/new")}>
            {t("teams.newTeam")}
          </Button>
        }
        isAdmin={isAdmin}
        adminOnlyMessage={t("teams.adminOnly")}
        stickyHeader
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TeamsTable
            teams={teams}
            isLoading={teamsQuery.isLoading}
            onDelete={setDeleteTarget}
          />
        </div>

        {teamsQuery.error ? (
          <p className="mt-4 text-sm text-red-500">
            {teamsQuery.error instanceof Error
              ? teamsQuery.error.message
              : "Failed to load teams."}
          </p>
        ) : null}
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        ariaLabel={t("teams.deleteTeam")}
        title={t("teams.deleteTeam")}
        description={<>{t("teams.deleteConfirm")}</>}
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
