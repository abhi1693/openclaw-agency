"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";

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
import { createOptimisticListDeleteMutation } from "@/lib/list-delete";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useUrlSorting } from "@/lib/use-url-sorting";
import type { BoardRead } from "@/api/generated/model";
import { BoardsTable } from "@/components/boards/BoardsTable";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { useLanguage } from "@/lib/i18n";
import { t } from "@/lib/translations";

const BOARD_SORTABLE_COLUMNS = ["name", "group", "updated_at"];

export default function BoardsPage() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { language } = useLanguage();
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

  const boardCount = boards.length;
  const description =
    language === "zh"
      ? `${t(language, "boards_desc_prefix")}${boardCount}${t(language, "boards_desc_suffix_many")}`
      : `${t(language, "boards_desc_prefix")}${boardCount} ${boardCount === 1 ? t(language, "boards_desc_suffix_one") : t(language, "boards_desc_suffix_many")}`;

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: t(language, "boards_sign_in"),
          forceRedirectUrl: "/boards",
          signUpForceRedirectUrl: "/boards",
        }}
        title={t(language, "boards_title")}
        description={description}
        headerActions={
          boards.length > 0 && isAdmin ? (
            <Link
              href="/boards/new"
              className={buttonVariants({
                size: "md",
                variant: "primary",
              })}
            >
              {t(language, "boards_create")}
            </Link>
          ) : null
        }
        stickyHeader
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <BoardsTable
            boards={boards}
            boardGroups={groups}
            isLoading={boardsQuery.isLoading}
            sorting={sorting}
            onSortingChange={onSortingChange}
            showActions
            stickyHeader
            onDelete={setDeleteTarget}
            emptyState={{
              title: t(language, "boards_empty_title"),
              description: t(language, "boards_empty_desc"),
              actionHref: "/boards/new",
              actionLabel: t(language, "boards_empty_action"),
            }}
          />
        </div>

        {boardsQuery.error ? (
          <p className="mt-4 text-sm text-red-500">
            {boardsQuery.error.message}
          </p>
        ) : null}
      </DashboardPageLayout>
      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        ariaLabel={t(language, "boards_delete_title")}
        title={t(language, "boards_delete_title")}
        description={
          <>
            {t(language, "boards_delete_desc_prefix")}
            {deleteTarget?.name}
            {t(language, "boards_delete_desc_suffix")}
          </>
        }
        errorMessage={deleteMutation.error?.message}
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
