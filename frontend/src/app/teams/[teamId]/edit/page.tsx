"use client";

export const dynamic = "force-dynamic";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import type { AgentTeamRead } from "@/components/teams/TeamCard";

import { customFetch } from "@/api/mutator";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useQuery, useMutation } from "@tanstack/react-query";

const TEAM_TYPES = [
  "custom",
  "task_force",
  "review_committee",
  "specialist_pool",
] as const;

type Params = Promise<{ teamId: string }>;

async function fetchTeam(teamId: string): Promise<AgentTeamRead> {
  const res = await customFetch<{ data: AgentTeamRead }>(
    `/api/v1/agent-teams/${teamId}`,
    { method: "GET" },
  );
  return res.data;
}

async function updateTeam(
  teamId: string,
  payload: Partial<AgentTeamRead>,
): Promise<AgentTeamRead> {
  const res = await customFetch<{ data: AgentTeamRead }>(
    `/api/v1/agent-teams/${teamId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
  return res.data;
}

export default function EditTeamPage({ params }: { params: Params }) {
  const { teamId } = use(params);
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamType, setTeamType] = useState("custom");

  const teamQuery = useQuery({
    queryKey: ["agent-team", teamId],
    queryFn: () => fetchTeam(teamId),
    enabled: Boolean(isSignedIn && isAdmin),
  });

  useEffect(() => {
    if (teamQuery.data) {
      setName(teamQuery.data.name);
      setDescription(teamQuery.data.description ?? "");
      setTeamType(teamQuery.data.team_type);
    }
  }, [teamQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<AgentTeamRead>) => updateTeam(teamId, payload),
    onSuccess: () => {
      router.push(`/teams/${teamId}`);
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      team_type: teamType,
    });
  };

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("teams.signInPrompt"),
        forceRedirectUrl: `/teams/${teamId}/edit`,
        signUpForceRedirectUrl: `/teams/${teamId}/edit`,
      }}
      title={t("teams.editTeam")}
      description=""
      isAdmin={isAdmin}
      adminOnlyMessage={t("teams.adminOnly")}
    >
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("teams.teamName")}
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder={t("teams.teamNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("teams.description")}
            </label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder={t("teams.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("teams.teamType")}
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={teamType}
              onChange={(e) => setTeamType(e.target.value)}
            >
              {TEAM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`teams.teamTypes.${type}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
          </div>

          {updateMutation.error instanceof Error ? (
            <p className="text-sm text-red-500">{updateMutation.error.message}</p>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/teams/${teamId}`)}
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
      </div>
    </DashboardPageLayout>
  );
}
