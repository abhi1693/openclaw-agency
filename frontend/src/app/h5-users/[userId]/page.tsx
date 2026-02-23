"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import {
  AgentAssignmentDialog,
  type AgentOption,
  type AssignmentRow,
} from "@/components/h5-users/AgentAssignmentDialog";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useTranslation } from "@/lib/i18n";
import { customFetch, ApiError } from "@/api/mutator";
import {
  useListAgentsApiV1AgentsGet,
  type listAgentsApiV1AgentsGetResponse,
} from "@/api/generated/agents/agents";
import { dateCell } from "@/components/tables/cell-formatters";

type H5UserDetail = {
  user: {
    id: string;
    username: string;
    display_name: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
  };
  assignments: Array<{
    id: string;
    h5_user_id: string;
    agent_id: string;
    board_id: string;
    role: string;
    assigned_at: string;
    assigned_by: string | null;
  }>;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  suspended: "bg-amber-50 text-amber-700",
  deleted: "bg-rose-50 text-rose-700",
};

export default function H5UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const queryClient = useQueryClient();

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const userIdParam = params?.userId;
  const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;

  const userQuery = useQuery<H5UserDetail>({
    queryKey: ["h5-user", userId],
    queryFn: async () => {
      const res = await customFetch<{ data: H5UserDetail; status: number }>(
        `/api/v1/h5/users/${userId}`,
        { method: "GET" },
      );
      return res.data;
    },
    enabled: Boolean(isSignedIn && isAdmin && userId),
  });

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
    },
  });

  const detail = userQuery.data;
  const user = detail?.user ?? null;

  const allAgents: AgentOption[] =
    agentsQuery.data?.status === 200
      ? (agentsQuery.data.data.items ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          board_id: a.board_id ?? null,
          board_name: null,
        }))
      : [];

  const assignments: AssignmentRow[] = (detail?.assignments ?? []).map((a) => {
    const agent = allAgents.find((ag) => ag.id === a.agent_id);
    return {
      id: a.id,
      agent_id: a.agent_id,
      agent_name: agent?.name,
      board_id: a.board_id,
      board_name: undefined,
      role: a.role,
    };
  });

  const assignMutation = useMutation({
    mutationFn: async ({
      agentId,
      boardId,
    }: {
      agentId: string;
      boardId: string;
    }) => {
      await customFetch(`/api/v1/h5/users/${userId}/assign`, {
        method: "POST",
        body: JSON.stringify({ agent_id: agentId, board_id: boardId, role: "user" }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      setAssignError(null);
      void queryClient.invalidateQueries({ queryKey: ["h5-user", userId] });
    },
    onError: (err: Error) => {
      setAssignError(err.message);
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async (agentId: string) => {
      await customFetch(`/api/v1/h5/users/${userId}/assign/${agentId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["h5-user", userId] });
    },
  });

  const statusStyle =
    STATUS_STYLES[user?.status ?? ""] ?? "bg-slate-100 text-slate-600";

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("h5Users.signInPrompt"),
        forceRedirectUrl: `/h5-users/${userId}`,
      }}
      title={
        user?.username
          ? `${user.username} — ${t("h5Users.detail")}`
          : t("h5Users.detail")
      }
      description={t("h5Users.detailDesc")}
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setAssignDialogOpen(true)}
            disabled={!user}
          >
            {t("h5Users.manageAssignments")}
          </Button>
          <Button variant="outline" onClick={() => router.push("/h5-users")}>
            {t("h5Users.backToUsers")}
          </Button>
        </div>
      }
      isAdmin={isAdmin}
      adminOnlyMessage={t("h5Users.adminOnly")}
    >
      {userQuery.isLoading ? (
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      ) : user ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {user.username}
                </h2>
                {user.display_name ? (
                  <p className="text-sm text-slate-500">{user.display_name}</p>
                ) : null}
              </div>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}
              >
                {t(`h5Users.status.${user.status}`) !== `h5Users.status.${user.status}`
                  ? t(`h5Users.status.${user.status}`)
                  : user.status}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              {user.email ? (
                <>
                  <dt className="font-medium text-slate-500">{t("common.email")}</dt>
                  <dd className="text-slate-900">{user.email}</dd>
                </>
              ) : null}
              {user.phone ? (
                <>
                  <dt className="font-medium text-slate-500">{t("h5Users.phone")}</dt>
                  <dd className="text-slate-900">{user.phone}</dd>
                </>
              ) : null}
              <dt className="font-medium text-slate-500">{t("h5Users.lastLogin")}</dt>
              <dd className="text-slate-900">
                {user.last_login_at ? dateCell(user.last_login_at) : "—"}
              </dd>
              <dt className="font-medium text-slate-500">{t("common.created")}</dt>
              <dd className="text-slate-900">{dateCell(user.created_at)}</dd>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("h5Users.currentAssignments")}
            </p>
            {assignments.length > 0 ? (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {a.agent_name ?? a.agent_id}
                      </p>
                      <p className="text-xs text-slate-500">{t("common.role")}: {a.role}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:text-rose-700"
                      disabled={unassignMutation.isPending}
                      onClick={() => unassignMutation.mutate(a.agent_id)}
                    >
                      {t("h5Users.unassign")}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t("h5Users.noAssignments")}</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t("h5Users.userNotFound")}</p>
      )}

      {user ? (
        <AgentAssignmentDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          userId={user.id}
          username={user.username}
          assignments={assignments}
          agents={allAgents}
          isAssigning={assignMutation.isPending}
          isUnassigning={unassignMutation.isPending}
          assignError={assignError}
          onAssign={(agentId, boardId) =>
            assignMutation.mutate({ agentId, boardId })
          }
          onUnassign={(agentId) => unassignMutation.mutate(agentId)}
        />
      ) : null}
    </DashboardPageLayout>
  );
}
