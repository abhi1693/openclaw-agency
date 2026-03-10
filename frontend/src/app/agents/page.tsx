"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";

import { AgentsTable } from "@/components/agents/AgentsTable";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";

import { ApiError } from "@/api/mutator";
import {
  type listAgentsApiV1AgentsGetResponse,
  getListAgentsApiV1AgentsGetQueryKey,
  useDeleteAgentApiV1AgentsAgentIdDelete,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  type listBoardsApiV1BoardsGetResponse,
  getListBoardsApiV1BoardsGetQueryKey,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import { type AgentRead } from "@/api/generated/model";
import { createOptimisticListDeleteMutation } from "@/lib/list-delete";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useUrlSorting } from "@/lib/use-url-sorting";


interface LocalAgent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
  modelId: string;
  modelLabel: string;
  modelRaw?: unknown;
  skills: number;
  lastActive: number | null;
  totalSessions: number;
  activeSessions: number;
  online: boolean;
}

function formatLastActive(timestamp: number | null) {
  if (!timestamp) return "Never";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "Unknown";
  }
}

function LocalAgentsSection() {
  const [agents, setAgents] = useState<LocalAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/agents/local', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? 'Failed to load local agents');
        }
        if (!cancelled) {
          setAgents(data.agents ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load local agents');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-8 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Local Agents</h2>
        <p className="text-sm text-slate-500">
          OpenClaw 本地 agent 配置与最近活跃情况。
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading local agents…</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-500">{error}</div>
        ) : agents.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No local agents found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Agent</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Model</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Skills</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Sessions</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Last active</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((agent) => (
                  <tr key={agent.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span className="text-lg leading-none">{agent.emoji}</span>
                        <div>
                          <div className="font-medium text-slate-900">{agent.name}</div>
                          <div className="text-xs text-slate-500">{agent.id}</div>
                          <p className="mt-1 max-w-md text-xs text-slate-500">
                            {agent.description}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{agent.role}</td>
                    <td className="px-4 py-4 text-slate-700">{agent.modelLabel}</td>
                    <td className="px-4 py-4 text-slate-700">{agent.skills}</td>
                    <td className="px-4 py-4 text-slate-700">
                      {agent.activeSessions}/{agent.totalSessions}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{formatLastActive(agent.lastActive)}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          agent.online
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {agent.online ? "Online" : "Offline"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

const AGENT_SORTABLE_COLUMNS = [
  "name",
  "status",
  "openclaw_session_id",
  "board_id",
  "last_seen_at",
  "updated_at",
];

export default function AgentsPage() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const { sorting, onSortingChange } = useUrlSorting({
    allowedColumnIds: AGENT_SORTABLE_COLUMNS,
    defaultSorting: [{ id: "name", desc: false }],
    paramPrefix: "agents",
  });

  const [deleteTarget, setDeleteTarget] = useState<AgentRead | null>(null);

  const boardsKey = getListBoardsApiV1BoardsGetQueryKey();
  const agentsKey = getListAgentsApiV1AgentsGetQueryKey();

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 15_000,
      refetchOnMount: "always",
    },
  });

  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? (boardsQuery.data.data.items ?? [])
        : [],
    [boardsQuery.data],
  );
  const agents = useMemo(
    () =>
      agentsQuery.data?.status === 200
        ? (agentsQuery.data.data.items ?? [])
        : [],
    [agentsQuery.data],
  );

  const deleteMutation = useDeleteAgentApiV1AgentsAgentIdDelete<
    ApiError,
    { previous?: listAgentsApiV1AgentsGetResponse }
  >(
    {
      mutation: createOptimisticListDeleteMutation<
        AgentRead,
        listAgentsApiV1AgentsGetResponse,
        { agentId: string }
      >({
        queryClient,
        queryKey: agentsKey,
        getItemId: (agent) => agent.id,
        getDeleteId: ({ agentId }) => agentId,
        onSuccess: () => {
          setDeleteTarget(null);
        },
        invalidateQueryKeys: [agentsKey, boardsKey],
      }),
    },
    queryClient,
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ agentId: deleteTarget.id });
  };

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: "Sign in to view agents.",
          forceRedirectUrl: "/agents",
          signUpForceRedirectUrl: "/agents",
        }}
        title="Agents"
        description={`${agents.length} agent${agents.length === 1 ? "" : "s"} total.`}
        headerActions={
          agents.length > 0 ? (
            <Button onClick={() => router.push("/agents/new")}>
              New agent
            </Button>
          ) : null
        }
        isAdmin={isAdmin}
        adminOnlyMessage="Only organization owners and admins can access agents."
        stickyHeader
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <AgentsTable
            agents={agents}
            boards={boards}
            isLoading={agentsQuery.isLoading}
            sorting={sorting}
            onSortingChange={onSortingChange}
            showActions
            stickyHeader
            onDelete={setDeleteTarget}
            emptyState={{
              title: "No agents yet",
              description:
                "Create your first agent to start executing tasks on this board.",
              actionHref: "/agents/new",
              actionLabel: "Create your first agent",
            }}
          />
        </div>

        {agentsQuery.error ? (
          <p className="mt-4 text-sm text-red-500">
            {agentsQuery.error.message}
          </p>
        ) : null}

        <LocalAgentsSection />
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        ariaLabel="Delete agent"
        title="Delete agent"
        description={
          <>
            This will remove {deleteTarget?.name}. This action cannot be undone.
          </>
        }
        errorMessage={deleteMutation.error?.message}
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
