"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { SignInButton, SignedIn, SignedOut, useAuth } from "@clerk/nextjs";

import { StatusPill } from "@/components/atoms/StatusPill";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getApiBaseUrl } from "@/lib/api-base";

const apiBase = getApiBaseUrl();

type Agent = {
  id: string;
  name: string;
  status: string;
  openclaw_session_id?: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  board_id?: string | null;
  is_board_lead?: boolean;
  is_gateway_main?: boolean;
};

type Board = {
  id: string;
  name: string;
  slug: string;
};

type ActivityEvent = {
  id: string;
  event_type: string;
  message?: string | null;
  agent_id?: string | null;
  created_at: string;
};

const parseTimestamp = (value?: string | null) => {
  if (!value) return null;
  const hasTz = /[zZ]|[+-]\d\d:\d\d$/.test(value);
  const normalized = hasTz ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatTimestamp = (value?: string | null) => {
  const date = parseTimestamp(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRelative = (value?: string | null) => {
  const date = parseTimestamp(value);
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

export default function AgentDetailPage() {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const params = useParams();
  const agentIdParam = params?.agentId;
  const agentId = Array.isArray(agentIdParam) ? agentIdParam[0] : agentIdParam;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const agentEvents = useMemo(() => {
    if (!agent) return [];
    return events.filter((event) => event.agent_id === agent.id);
  }, [events, agent]);
  const linkedBoard = useMemo(() => {
    if (!agent?.board_id || agent?.is_gateway_main) return null;
    return boards.find((board) => board.id === agent.board_id) ?? null;
  }, [boards, agent?.board_id, agent?.is_gateway_main]);


  const loadAgent = async () => {
    if (!isSignedIn || !agentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const [agentResponse, activityResponse, boardsResponse] = await Promise.all([
        fetch(`${apiBase}/api/v1/agents/${agentId}`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        }),
        fetch(`${apiBase}/api/v1/activity?limit=200`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        }),
        fetch(`${apiBase}/api/v1/boards`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        }),
      ]);
      if (!agentResponse.ok) {
        throw new Error("Unable to load agent.");
      }
      if (!activityResponse.ok) {
        throw new Error("Unable to load activity.");
      }
      if (!boardsResponse.ok) {
        throw new Error("Unable to load boards.");
      }
      const agentData = (await agentResponse.json()) as Agent;
      const eventsData = (await activityResponse.json()) as ActivityEvent[];
      const boardsData = (await boardsResponse.json()) as Board[];
      setAgent(agentData);
      setEvents(eventsData);
      setBoards(boardsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, agentId]);

  const handleDelete = async () => {
    if (!agent || !isSignedIn) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/v1/agents/${agent.id}`, {
        method: "DELETE",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!response.ok) {
        throw new Error("Unable to delete agent.");
      }
      router.push("/agents");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DashboardShell>
      <SignedOut>
        <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl surface-panel p-10 text-center">
          <p className="text-sm text-muted">Sign in to view agents.</p>
          <SignInButton
            mode="modal"
            forceRedirectUrl="/agents"
            signUpForceRedirectUrl="/agents"
          >
            <Button>Sign in</Button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <div className="flex h-full flex-col gap-6 rounded-2xl surface-panel p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-quiet">
                Agents
              </p>
              <h1 className="text-2xl font-semibold text-strong">
                {agent?.name ?? "Agent"}
              </h1>
              <p className="text-sm text-muted">
                Review agent health, session binding, and recent activity.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push("/agents")}
              >
                Back to agents
              </Button>
              {agent ? (
                <Link
                  href={`/agents/${agent.id}/edit`}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-[color:var(--border)] px-4 text-sm font-semibold text-muted transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                >
                  Edit
                </Link>
              ) : null}
              {agent ? (
                <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-xs text-muted">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              Loading agent details…
            </div>
          ) : agent ? (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                        Overview
                      </p>
                      <p className="mt-1 text-lg font-semibold text-strong">
                        {agent.name}
                      </p>
                    </div>
                    <StatusPill status={agent.status} />
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                        Agent ID
                      </p>
                      <p className="mt-1 text-sm text-muted">{agent.id}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                        Session key
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {agent.openclaw_session_id ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                        Board
                      </p>
                      {agent.is_gateway_main ? (
                        <p className="mt-1 text-sm text-strong">Gateway main (no board)</p>
                      ) : linkedBoard ? (
                        <Link
                          href={`/boards/${linkedBoard.id}`}
                          className="mt-1 inline-flex text-sm font-medium text-[color:var(--accent)] transition hover:underline"
                        >
                          {linkedBoard.name}
                        </Link>
                      ) : (
                        <p className="mt-1 text-sm text-strong">—</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                        Last seen
                      </p>
                      <p className="mt-1 text-sm text-strong">
                        {formatRelative(agent.last_seen_at)}
                      </p>
                      <p className="text-xs text-quiet">
                        {formatTimestamp(agent.last_seen_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                        Updated
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {formatTimestamp(agent.updated_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                        Created
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {formatTimestamp(agent.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                      Health
                    </p>
                    <StatusPill status={agent.status} />
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-muted">
                    <div className="flex items-center justify-between">
                      <span>Heartbeat window</span>
                      <span>{formatRelative(agent.last_seen_at)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Session binding</span>
                      <span>{agent.openclaw_session_id ? "Bound" : "Unbound"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      <span className="text-strong">{agent.status}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                    Activity
                  </p>
                  <p className="text-xs text-quiet">
                    {agentEvents.length} events
                  </p>
                </div>
                <div className="space-y-3">
                  {agentEvents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-sm text-muted">
                      No activity yet for this agent.
                    </div>
                  ) : (
                    agentEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-sm text-muted"
                      >
                        <p className="font-medium text-strong">
                          {event.message ?? event.event_type}
                        </p>
                        <p className="mt-1 text-xs text-quiet">
                          {formatTimestamp(event.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              Agent not found.
            </div>
          )}
        </div>
      </SignedIn>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent aria-label="Delete agent">
          <DialogHeader>
            <DialogTitle>Delete agent</DialogTitle>
            <DialogDescription>
              This will remove {agent?.name}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-xs text-muted">
              {deleteError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
