"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";

import { StatusPill } from "@/components/atoms/StatusPill";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, useAuthedMutation, useAuthedQuery } from "@/lib/api-query";

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
};

type Board = {
  id: string;
  name: string;
  slug: string;
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

const truncate = (value?: string | null, max = 18) => {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
};

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);

  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  const boardsQuery = useAuthedQuery<Board[]>(["boards"], "/api/v1/boards", {
    refetchInterval: 30_000,
    refetchOnMount: "always",
  });
  const agentsQuery = useAuthedQuery<Agent[]>(["agents"], "/api/v1/agents", {
    refetchInterval: 15_000,
    refetchOnMount: "always",
  });

  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data]);
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);

  const deleteMutation = useAuthedMutation<void, Agent, { previous?: Agent[] }>(
    async (agent, token) =>
      apiRequest(`/api/v1/agents/${agent.id}`, {
        method: "DELETE",
        token,
      }),
    {
      onMutate: async (agent) => {
        await queryClient.cancelQueries({ queryKey: ["agents"] });
        const previous = queryClient.getQueryData<Agent[]>(["agents"]);
        queryClient.setQueryData<Agent[]>(["agents"], (old = []) =>
          old.filter((item) => item.id !== agent.id)
        );
        return { previous };
      },
      onError: (_error, _agent, context) => {
        if (context?.previous) {
          queryClient.setQueryData(["agents"], context.previous);
        }
      },
      onSuccess: () => {
        setDeleteTarget(null);
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: ["agents"] });
      },
    }
  );

  const sortedAgents = useMemo(() => [...agents], [agents]);


  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget);
  };

  const columns = useMemo<ColumnDef<Agent>[]>(
    () => {
      const resolveBoardName = (agent: Agent) =>
        boards.find((board) => board.id === agent.board_id)?.name ?? "—";

      return [
        {
          accessorKey: "name",
          header: "Agent",
          cell: ({ row }) => (
            <Link href={`/agents/${row.original.id}`} className="group block">
              <p className="text-sm font-medium text-slate-900 group-hover:text-blue-600">
                {row.original.name}
              </p>
              <p className="text-xs text-slate-500">ID {row.original.id}</p>
            </Link>
          ),
        },
        {
          accessorKey: "status",
          header: "Status",
          cell: ({ row }) => <StatusPill status={row.original.status} />,
        },
        {
          accessorKey: "openclaw_session_id",
          header: "Session",
          cell: ({ row }) => (
            <span className="text-sm text-slate-700">
              {truncate(row.original.openclaw_session_id)}
            </span>
          ),
        },
        {
          accessorKey: "board_id",
          header: "Board",
          cell: ({ row }) => (
            <span className="text-sm text-slate-700">
              {resolveBoardName(row.original)}
            </span>
          ),
        },
        {
          accessorKey: "last_seen_at",
          header: "Last seen",
          cell: ({ row }) => (
            <span className="text-sm text-slate-700">
              {formatRelative(row.original.last_seen_at)}
            </span>
          ),
        },
        {
          accessorKey: "updated_at",
          header: "Updated",
          cell: ({ row }) => (
            <span className="text-sm text-slate-700">
              {formatTimestamp(row.original.updated_at)}
            </span>
          ),
        },
        {
          id: "actions",
          header: "",
          cell: ({ row }) => (
            <div className="flex justify-end gap-2">
              <Link
                href={`/agents/${row.original.id}/edit`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Edit
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(row.original)}
              >
                Delete
              </Button>
            </div>
          ),
        },
      ];
    },
    [boards]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: sortedAgents,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <DashboardShell>
      <SignedOut>
        <div className="col-span-2 flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-50 p-10 text-center">
          <div className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
            <p className="text-sm text-slate-600">Sign in to view agents.</p>
            <SignInButton
              mode="modal"
              forceRedirectUrl="/agents"
              signUpForceRedirectUrl="/agents"
            >
              <Button className="mt-4">Sign in</Button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="sticky top-0 z-30 border-b border-slate-200 bg-white">
            <div className="px-8 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Agents
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {agents.length} agent{agents.length === 1 ? "" : "s"} total.
                  </p>
                </div>
                {agents.length > 0 ? (
                  <Button onClick={() => router.push("/agents/new")}>
                    New agent
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} className="px-6 py-3">
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {agentsQuery.isLoading ? (
                      <tr>
                        <td colSpan={columns.length} className="px-6 py-8">
                          <span className="text-sm text-slate-500">Loading…</span>
                        </td>
                      </tr>
                    ) : table.getRowModel().rows.length ? (
                      table.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-6 py-4">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={columns.length} className="px-6 py-16">
                          <div className="flex flex-col items-center justify-center text-center">
                            <div className="mb-4 rounded-full bg-slate-50 p-4">
                              <svg
                                className="h-16 w-16 text-slate-300"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                              </svg>
                            </div>
                            <h3 className="mb-2 text-lg font-semibold text-slate-900">
                              No agents yet
                            </h3>
                            <p className="mb-6 max-w-md text-sm text-slate-500">
                              Create your first agent to start executing tasks
                              on this board.
                            </p>
                            <Link
                              href="/agents/new"
                              className={buttonVariants({ size: "md", variant: "primary" })}
                            >
                              Create your first agent
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {agentsQuery.error ? (
              <p className="mt-4 text-sm text-red-500">
                {agentsQuery.error.message}
              </p>
            ) : null}
          </div>
        </main>
      </SignedIn>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent aria-label="Delete agent">
          <DialogHeader>
            <DialogTitle>Delete agent</DialogTitle>
            <DialogDescription>
              This will remove {deleteTarget?.name}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.error ? (
            <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-xs text-muted">
              {deleteMutation.error.message}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
