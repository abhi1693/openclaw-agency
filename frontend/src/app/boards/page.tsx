"use client";

export const dynamic = "force-dynamic";

import { memo, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/auth/clerk";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/mutator";
import {
  type listBoardsApiV1BoardsGetResponse,
  getListBoardsApiV1BoardsGetQueryKey,
  useDeleteBoardApiV1BoardsBoardIdDelete,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type listBoardGroupsApiV1BoardGroupsGetResponse,
  useListBoardGroupsApiV1BoardGroupsGet,
} from "@/api/generated/board-groups/board-groups";
import { gatewaysStatusApiV1GatewaysStatusGet } from "@/api/generated/gateways/gateways";
import type { GatewaysStatusResponse } from "@/api/generated/model/gatewaysStatusResponse";
import { createOptimisticListDeleteMutation } from "@/lib/list-delete";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useUrlSorting } from "@/lib/use-url-sorting";
import type { BoardGroupRead, BoardRead } from "@/api/generated/model";
import {
  BoardsTable,
  type BoardGatewayConnectionStatus,
} from "@/components/boards/BoardsTable";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const BOARD_SORTABLE_COLUMNS = ["name", "group", "updated_at"];
const GATEWAY_STATUS_REFETCH_INTERVAL_MS = 10_000;
const GATEWAY_STATUS_DEBOUNCE_MS = 200;

/** Ensures only one in-flight request per board_id within the debounce window. */
function createGatewayStatusRequestCache() {
  const inflight = new Map<string, Promise<BoardGatewayConnectionStatus>>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  return {
      schedule(boardId: string, fn: () => Promise<BoardGatewayConnectionStatus>): Promise<BoardGatewayConnectionStatus> {
        // Return existing in-flight promise if already running
        const existing = inflight.get(boardId);
        if (existing) return existing;

        // Debounce: cancel any previously scheduled run for this boardId
        const queued = pending.get(boardId);
        if (queued) {
          clearTimeout(queued);
          pending.delete(boardId);
        }

        return new Promise<BoardGatewayConnectionStatus>((resolve) => {
          const timer = setTimeout(async () => {
            pending.delete(boardId);
            const promise = fn();
            inflight.set(boardId, promise);
            try {
              resolve(await promise);
            } finally {
              inflight.delete(boardId);
            }
          }, GATEWAY_STATUS_DEBOUNCE_MS);
          pending.set(boardId, timer);
        });
      },
    };
}

type GatewayStatusTarget = {
  boardId: string;
  gatewayId: string;
};

type BoardGatewayStatusEntry = GatewayStatusTarget & {
  status: BoardGatewayConnectionStatus;
};

type BoardsTableSectionProps = {
  boards: BoardRead[];
  groups: BoardGroupRead[];
  isLoading: boolean;
  sorting: ReturnType<typeof useUrlSorting>["sorting"];
  onSortingChange: ReturnType<typeof useUrlSorting>["onSortingChange"];
  error: ApiError | null;
  gatewayStatusById: Record<string, BoardGatewayConnectionStatus>;
  onDelete: (board: BoardRead) => void;
};

const EMPTY_GATEWAY_STATUS_BY_ID: Record<string, BoardGatewayConnectionStatus> =
  {};

function areGatewayStatusesEqual(
  left: Record<string, BoardGatewayConnectionStatus>,
  right: Record<string, BoardGatewayConnectionStatus>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

function useStableGatewayStatusById(
  entries: BoardGatewayStatusEntry[] | undefined,
) {
  const previousMapRef = useRef<Record<string, BoardGatewayConnectionStatus>>(
    EMPTY_GATEWAY_STATUS_BY_ID,
  );

  return useMemo<Record<string, BoardGatewayConnectionStatus>>(() => {
    if (!entries?.length) {
      if (Object.keys(previousMapRef.current).length === 0) {
        return previousMapRef.current;
      }

      previousMapRef.current = EMPTY_GATEWAY_STATUS_BY_ID;
      return previousMapRef.current;
    }

    const nextMap = Object.fromEntries(
      entries.map((entry) => [entry.gatewayId, entry.status]),
    ) as Record<string, BoardGatewayConnectionStatus>;

    if (areGatewayStatusesEqual(previousMapRef.current, nextMap)) {
      return previousMapRef.current;
    }

    previousMapRef.current = nextMap;
    return nextMap;
  }, [entries]);
}

export default function BoardsPage() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { sorting, onSortingChange } = useUrlSorting({
    allowedColumnIds: BOARD_SORTABLE_COLUMNS,
    defaultSorting: [{ id: "name", desc: false }],
    paramPrefix: "boards",
  });

  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [deleteTarget, setDeleteTarget] = useState<BoardRead | null>(null);

  const boardsKey = getListBoardsApiV1BoardsGetQueryKey();
  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn),
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const groupsQuery = useListBoardGroupsApiV1BoardGroupsGet<
    listBoardGroupsApiV1BoardGroupsGetResponse,
    ApiError
  >(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 30_000,
        refetchOnMount: "always",
      },
    },
  );

  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? (boardsQuery.data.data.items ?? [])
        : [],
    [boardsQuery.data],
  );

  const groups = useMemo(() => {
    if (groupsQuery.data?.status !== 200) return [];
    return groupsQuery.data.data.items ?? [];
  }, [groupsQuery.data]);
  const gatewayStatusTargets = useMemo<GatewayStatusTarget[]>(() => {
    const targetsByGatewayId = new Map<string, GatewayStatusTarget>();
    for (const board of boards) {
      const gatewayId = board.gateway_id;
      if (!gatewayId || targetsByGatewayId.has(gatewayId)) continue;
      targetsByGatewayId.set(gatewayId, {
        boardId: board.id,
        gatewayId,
      });
    }
    return [...targetsByGatewayId.values()].sort((left, right) =>
      left.gatewayId.localeCompare(right.gatewayId),
    );
  }, [boards]);

  const statusRequestCache = useMemo(() => createGatewayStatusRequestCache(), []);

  const gatewayStatusesQuery = useQuery<BoardGatewayStatusEntry[], ApiError>({
    queryKey: [
      "boards",
      "gateway-statuses",
      gatewayStatusTargets.map((target) => `${target.gatewayId}:${target.boardId}`),
    ],
    enabled: Boolean(isSignedIn && gatewayStatusTargets.length > 0),
    refetchInterval: GATEWAY_STATUS_REFETCH_INTERVAL_MS,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      return Promise.all(
        gatewayStatusTargets.map(async (target) => {
          try {
            const response = await statusRequestCache.schedule(target.boardId, async () => {
              const res = await gatewaysStatusApiV1GatewaysStatusGet(
                { board_id: target.boardId },
                { signal },
              );

              if (res.status !== 200) return "degraded" as const;

              const payload: GatewaysStatusResponse = res.data;
              const hasHealthIssue = Boolean(payload.error || payload.main_session_error);

              return payload.connected
                ? (hasHealthIssue ? "degraded" : "connected")
                : "disconnected";
            });

            return { ...target, status: response };
          } catch (error) {
            if (signal.aborted) throw error;
            return { ...target, status: "degraded" as const };
          }
        }),
      );
    },
  });

  const gatewayStatusById = useStableGatewayStatusById(
    gatewayStatusesQuery.data,
  );

  const deleteMutation = useDeleteBoardApiV1BoardsBoardIdDelete<
    ApiError,
    { previous?: listBoardsApiV1BoardsGetResponse }
  >(
    {
      mutation: createOptimisticListDeleteMutation<
        BoardRead,
        listBoardsApiV1BoardsGetResponse,
        { boardId: string }
      >({
        queryClient,
        queryKey: boardsKey,
        getItemId: (board) => board.id,
        getDeleteId: ({ boardId }) => boardId,
        onSuccess: () => {
          setDeleteTarget(null);
        },
        invalidateQueryKeys: [boardsKey],
      }),
    },
    queryClient,
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ boardId: deleteTarget.id });
  };

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: "Sign in to view boards.",
          forceRedirectUrl: "/boards",
          signUpForceRedirectUrl: "/boards",
        }}
        title="Boards"
        description={`Manage boards and task workflows. ${boards.length} board${boards.length === 1 ? "" : "s"} total.`}
        headerActions={
          boards.length > 0 && isAdmin ? (
            <Link
              href="/boards/new"
              className={buttonVariants({
                size: "md",
                variant: "primary",
              })}
            >
              Create board
            </Link>
          ) : null
        }
        stickyHeader
      >
        <ErrorBoundary
          resetKeys={[boardsQuery.error?.message]}
          fallbackRender={({ error }) => (
            <BoardsTableErrorCard message={error.message} />
          )}
        >
          <BoardsTableSection
            boards={boards}
            groups={groups}
            isLoading={boardsQuery.isLoading}
            sorting={sorting}
            onSortingChange={onSortingChange}
            error={boardsQuery.error ?? null}
            gatewayStatusById={gatewayStatusById}
            onDelete={setDeleteTarget}
          />
        </ErrorBoundary>
      </DashboardPageLayout>
      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        ariaLabel="Delete board"
        title="Delete board"
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

const BoardsTableSection = memo(function BoardsTableSection({
  boards,
  groups,
  isLoading,
  sorting,
  onSortingChange,
  error,
  gatewayStatusById,
  onDelete,
}: BoardsTableSectionProps) {
  if (error) {
    throw error;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <BoardsTable
        boards={boards}
        boardGroups={groups}
        isLoading={isLoading}
        sorting={sorting}
        onSortingChange={onSortingChange}
        gatewayStatusById={gatewayStatusById}
        showActions
        stickyHeader
        onDelete={onDelete}
        emptyState={{
          title: "No boards yet",
          description:
            "Create your first board to start routing tasks and monitoring work across agents.",
          actionHref: "/boards/new",
          actionLabel: "Create your first board",
        }}
      />
    </div>
  );
});

BoardsTableSection.displayName = "BoardsTableSection";

function BoardsTableErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader className="pb-3">
        <p className="text-sm font-medium text-red-700">
          Failed to load boards
        </p>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-red-600">{message}</p>
      </CardContent>
    </Card>
  );
}
