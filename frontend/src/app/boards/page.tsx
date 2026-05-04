"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
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
const GATEWAY_STATUS_REFETCH_INTERVAL_MS = 15_000;

type GatewayStatusTarget = {
  boardId: string;
  gatewayId: string;
};

type BoardGatewayStatusEntry = GatewayStatusTarget & {
  status: BoardGatewayConnectionStatus;
};

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
            const response = await gatewaysStatusApiV1GatewaysStatusGet(
              { board_id: target.boardId },
              { signal },
            );

            if (response.status !== 200) {
              return { ...target, status: "degraded" as const };
            }

            const payload: GatewaysStatusResponse = response.data;
            const hasHealthIssue = Boolean(payload.error || payload.main_session_error);

            return {
              ...target,
              status: payload.connected
                ? hasHealthIssue
                  ? "degraded"
                  : "connected"
                : "disconnected",
            };
          } catch (error) {
            if (signal.aborted) throw error;
            return { ...target, status: "degraded" as const };
          }
        }),
      );
    },
  });

  const gatewayStatusById = useMemo<Record<string, BoardGatewayConnectionStatus>>(
    () =>
      Object.fromEntries(
        (gatewayStatusesQuery.data ?? []).map((entry) => [
          entry.gatewayId,
          entry.status,
        ]),
      ),
    [gatewayStatusesQuery.data],
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

function BoardsTableSection({
  boards,
  groups,
  isLoading,
  sorting,
  onSortingChange,
  error,
  gatewayStatusById,
  onDelete,
}: {
  boards: BoardRead[];
  groups: BoardGroupRead[];
  isLoading: boolean;
  sorting: ReturnType<typeof useUrlSorting>["sorting"];
  onSortingChange: ReturnType<typeof useUrlSorting>["onSortingChange"];
  error: ApiError | null;
  gatewayStatusById: Record<string, BoardGatewayConnectionStatus>;
  onDelete: (board: BoardRead) => void;
}) {
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
}

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
