"use client";

export const dynamic = "force-dynamic";

import { use, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { TeamMemberGrid } from "@/components/teams/TeamMemberGrid";
import { AgentRoleBadge } from "@/components/teams/AgentRoleBadge";
import type { AgentTeamRead } from "@/components/teams/TeamCard";
import type { AgentTeamMemberRead } from "@/components/teams/TeamMemberGrid";

import { customFetch } from "@/api/mutator";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function fetchTeam(teamId: string): Promise<AgentTeamRead> {
  const res = await customFetch<{ data: AgentTeamRead }>(
    `/api/v1/agent-teams/${teamId}`,
    { method: "GET" },
  );
  return res.data;
}

async function fetchMembers(teamId: string): Promise<AgentTeamMemberRead[]> {
  const res = await customFetch<{ data: AgentTeamMemberRead[] }>(
    `/api/v1/agent-teams/${teamId}/members`,
    { method: "GET" },
  );
  return res.data ?? [];
}

async function removeMember(teamId: string, agentId: string): Promise<void> {
  await customFetch(`/api/v1/agent-teams/${teamId}/members/${agentId}`, {
    method: "DELETE",
  });
}

type Params = Promise<{ teamId: string }>;

export default function TeamDetailPage({ params }: { params: Params }) {
  const { teamId } = use(params);
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const teamQueryKey = ["agent-team", teamId];
  const membersQueryKey = ["agent-team-members", teamId];

  const teamQuery = useQuery({
    queryKey: teamQueryKey,
    queryFn: () => fetchTeam(teamId),
    enabled: Boolean(isSignedIn && isAdmin),
  });

  const membersQuery = useQuery({
    queryKey: membersQueryKey,
    queryFn: () => fetchMembers(teamId),
    enabled: Boolean(isSignedIn && isAdmin),
    refetchInterval: 15_000,
  });

  const removeMutation = useMutation({
    mutationFn: (agentId: string) => removeMember(teamId, agentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: membersQueryKey });
      void queryClient.invalidateQueries({ queryKey: teamQueryKey });
    },
  });

  const team = teamQuery.data;
  const members = membersQuery.data ?? [];

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("teams.signInPrompt"),
        forceRedirectUrl: `/teams/${teamId}`,
        signUpForceRedirectUrl: `/teams/${teamId}`,
      }}
      title={team?.name ?? "…"}
      description={team?.description ?? ""}
      headerActions={
        team ? (
          <Link href={`/teams/${teamId}/edit`}>
            <Button variant="outline">{t("teams.editTeam")}</Button>
          </Link>
        ) : null
      }
      isAdmin={isAdmin}
      adminOnlyMessage={t("teams.adminOnly")}
      stickyHeader
    >
      {team ? (
        <div className="space-y-6">
          {/* Team info card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("teams.teamType")}</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {t(`teams.teamTypes.${team.team_type}` as Parameters<typeof t>[0])}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("teams.members")}</dt>
                <dd className="mt-1 text-sm text-slate-900">{team.member_count}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("common.created")}</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {new Date(team.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Members */}
          <div>
            <h2 className="mb-4 font-semibold text-slate-900">{t("teams.members")}</h2>
            {membersQuery.isLoading ? (
              <div className="text-sm text-slate-500">{t("common.loading")}</div>
            ) : (
              <TeamMemberGrid
                members={members}
                onRemove={(agentId) => removeMutation.mutate(agentId)}
              />
            )}
          </div>
        </div>
      ) : teamQuery.isLoading ? (
        <div className="text-sm text-slate-500">{t("common.loading")}</div>
      ) : (
        <div className="text-sm text-red-500">Team not found.</div>
      )}
    </DashboardPageLayout>
  );
}
