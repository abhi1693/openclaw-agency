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


const MODEL_LABELS: Record<string, string> = {
  'anthropic/claude-opus-4-6':   'Claude Opus 4.6',
  'anthropic/claude-opus-4-5':   'Claude Opus 4.5',
  'anthropic/claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'anthropic/claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'anthropic/claude-haiku-4-5':  'Claude Haiku 4.5',
  'minimax-portal/MiniMax-M2.5': 'MiniMax M2.5',
  'openai-codex/gpt-5.4':        'GPT-5.4',
  'openai-codex/gpt-5.3-codex':  'GPT-5.3 Codex',
};

function getModelLabel(id: string) {
  return MODEL_LABELS[id] ?? id.split('/').pop() ?? id;
}

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

interface EditState {
  primary: string;
  fallbacks: string[];
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
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/agents/local', { cache: 'no-store' });
      const data = await response.json() as { agents?: LocalAgent[]; availableModels?: string[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to load local agents');
      setAgents(data.agents ?? []);
      if (data.availableModels?.length) setAvailableModels(data.availableModels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load local agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAgents(); }, []);

  const startEdit = (agent: LocalAgent) => {
    const raw = agent.modelRaw as { primary?: string; fallbacks?: string[] } | string | undefined;
    const primary = typeof raw === 'object' && raw !== null ? (raw.primary ?? agent.modelId) : agent.modelId;
    const fallbacks = typeof raw === 'object' && raw !== null ? (raw.fallbacks ?? []) : [];
    setEdits(prev => ({ ...prev, [agent.id]: { primary, fallbacks } }));
    setEditingId(agent.id);
  };

  const cancelEdit = (agentId: string) => {
    setEdits(prev => { const next = { ...prev }; delete next[agentId]; return next; });
    if (editingId === agentId) setEditingId(null);
  };

  const dirtyAgents = Object.keys(edits);
  const hasDirty = dirtyAgents.length > 0;

  const applyChanges = async () => {
    if (!confirm('This will restart the gateway and apply model changes. Continue?')) return;
    setApplying(true);
    setToast('Restarting gateway…');
    try {
      const changes = dirtyAgents.map(agentId => ({
        agentId,
        model: { primary: edits[agentId].primary, fallbacks: edits[agentId].fallbacks },
      }));
      const res = await fetch('/api/agents/local/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json() as { ok?: boolean; agentsUpdated?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      setEdits({});
      setEditingId(null);
      setToast(`✅ Applied! ${data.agentsUpdated} agent(s) updated. Gateway restarting…`);
      setTimeout(() => { setToast(null); void loadAgents(); }, 3000);
    } catch (err) {
      setToast(`❌ ${err instanceof Error ? err.message : 'Failed'}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setApplying(false);
    }
  };

  const discardAll = () => {
    setEdits({});
    setEditingId(null);
  };

  return (
    <section className="mt-8 space-y-4">
      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Unsaved changes action bar */}
      {hasDirty && (
        <div className="sticky top-0 z-40 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm shadow-sm">
          <span className="text-amber-800">
            ⚠️ You have unsaved changes ({dirtyAgents.length} agent{dirtyAgents.length > 1 ? 's' : ''} modified)
          </span>
          <div className="flex gap-2">
            <button
              onClick={discardAll}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Discard
            </button>
            <button
              onClick={() => void applyChanges()}
              disabled={applying}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {applying ? 'Applying…' : 'Apply Changes & Restart Gateway'}
            </button>
          </div>
        </div>
      )}

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
          <div className="px-6 py-10 text-center">
            <svg
              className="mx-auto h-16 w-16 text-slate-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <p className="mt-4 text-sm font-semibold text-slate-900">
              No local agents registered
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Register a local agent to view model assignments and recent activity here.
            </p>
          </div>
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
                {agents.map((agent) => {
                  const isEditing = editingId === agent.id;
                  const edit = edits[agent.id];
                  const isDirty = !!edit;
                  return (
                    <tr key={agent.id} className={`align-top ${isDirty ? 'bg-amber-50/40' : ''}`}>
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
                      <td className="px-4 py-4 min-w-[280px]">
                        {isEditing && edit ? (
                          <div className="space-y-3">
                            {/* Primary model selector */}
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">Primary</label>
                              <select
                                value={edit.primary}
                                onChange={e => setEdits(prev => ({ ...prev, [agent.id]: { ...edit, primary: e.target.value } }))}
                                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
                              >
                                {availableModels.map(m => (
                                  <option key={m} value={m}>{getModelLabel(m)} — {m}</option>
                                ))}
                              </select>
                            </div>
                            {/* Fallbacks */}
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">Fallbacks</label>
                              <div className="space-y-1">
                                {edit.fallbacks.map((fb, i) => (
                                  <div key={`${fb}-${i}`} className="flex items-center gap-1">
                                    <span className="flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                      {getModelLabel(fb)}
                                    </span>
                                    <button
                                      onClick={() => setEdits(prev => ({
                                        ...prev,
                                        [agent.id]: { ...edit, fallbacks: edit.fallbacks.filter((_, j) => j !== i) }
                                      }))}
                                      className="px-1 text-xs text-slate-400 hover:text-red-500"
                                      title="Remove"
                                    >
                                      ×
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (i === 0) return;
                                        const fbs = [...edit.fallbacks];
                                        [fbs[i - 1], fbs[i]] = [fbs[i], fbs[i - 1]];
                                        setEdits(prev => ({ ...prev, [agent.id]: { ...edit, fallbacks: fbs } }));
                                      }}
                                      disabled={i === 0}
                                      className="px-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                      title="Move up"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (i === edit.fallbacks.length - 1) return;
                                        const fbs = [...edit.fallbacks];
                                        [fbs[i], fbs[i + 1]] = [fbs[i + 1], fbs[i]];
                                        setEdits(prev => ({ ...prev, [agent.id]: { ...edit, fallbacks: fbs } }));
                                      }}
                                      disabled={i === edit.fallbacks.length - 1}
                                      className="px-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                      title="Move down"
                                    >
                                      ↓
                                    </button>
                                  </div>
                                ))}
                                {/* Add fallback dropdown */}
                                <select
                                  defaultValue=""
                                  onChange={e => {
                                    if (!e.target.value) return;
                                    if (edit.fallbacks.includes(e.target.value)) return;
                                    const val = e.target.value;
                                    setEdits(prev => ({
                                      ...prev,
                                      [agent.id]: { ...edit, fallbacks: [...edit.fallbacks, val] }
                                    }));
                                    e.target.value = '';
                                  }}
                                  className="w-full rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 focus:outline-none"
                                >
                                  <option value="">+ Add fallback…</option>
                                  {availableModels
                                    .filter(m => !edit.fallbacks.includes(m) && m !== edit.primary)
                                    .map(m => (
                                      <option key={m} value={m}>{getModelLabel(m)}</option>
                                    ))}
                                </select>
                              </div>
                            </div>
                            <button
                              onClick={() => cancelEdit(agent.id)}
                              className="text-xs text-slate-500 underline hover:text-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="text-slate-700">
                                {isDirty ? getModelLabel(edit.primary) : agent.modelLabel}
                              </div>
                              {isDirty && edit.fallbacks.length > 0 && (
                                <div className="mt-0.5 text-xs text-slate-400">
                                  +{edit.fallbacks.length} fallback{edit.fallbacks.length > 1 ? 's' : ''}
                                </div>
                              )}
                              {isDirty && (
                                <span className="mt-0.5 inline-block text-xs font-medium text-amber-600">
                                  modified
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => startEdit(agent)}
                              className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Edit model"
                            >
                              ✏️
                            </button>
                          </div>
                        )}
                      </td>
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
                  );
                })}
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
