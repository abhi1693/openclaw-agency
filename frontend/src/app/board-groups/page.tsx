"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";

import { ApiError } from "@/api/mutator";
import {
  type listBoardGroupsApiV1BoardGroupsGetResponse,
  getListBoardGroupsApiV1BoardGroupsGetQueryKey,
  useDeleteBoardGroupApiV1BoardGroupsGroupIdDelete,
  useListBoardGroupsApiV1BoardGroupsGet,
} from "@/api/generated/board-groups/board-groups";
import { BoardGroupsTable } from "@/components/board-groups/BoardGroupsTable";
import type { BoardGroupRead } from "@/api/generated/model";
import { createOptimisticListDeleteMutation } from "@/lib/list-delete";
import { useUrlSorting } from "@/lib/use-url-sorting";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";

const BOARD_GROUP_SORTABLE_COLUMNS = ["name", "updated_at"];

export default function BoardGroupsPage() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { sorting, onSortingChange } = useUrlSorting({
    allowedColumnIds: BOARD_GROUP_SORTABLE_COLUMNS,
    defaultSorting: [{ id: "name", desc: false }],
    paramPrefix: "board_groups",
  });
  const [deleteTarget, setDeleteTarget] = useState<BoardGroupRead | null>(null);

  const groupsKey = getListBoardGroupsApiV1BoardGroupsGetQueryKey();
  const groupsQuery = useListBoardGroupsApiV1BoardGroupsGet<
    listBoardGroupsApiV1BoardGroupsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn),
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const groups = useMemo(
    () =>
      groupsQuery.data?.status === 200
        ? (groupsQuery.data.data.items ?? [])
        : [],
    [groupsQuery.data],
  );

  const deleteMutation = useDeleteBoardGroupApiV1BoardGroupsGroupIdDelete<
    ApiError,
    { previous?: listBoardGroupsApiV1BoardGroupsGetResponse }
  >(
    {
      mutation: createOptimisticListDeleteMutation<
        BoardGroupRead,
        listBoardGroupsApiV1BoardGroupsGetResponse,
        { groupId: string }
      >({
        queryClient,
        queryKey: groupsKey,
        getItemId: (group) => group.id,
        getDeleteId: ({ groupId }) => groupId,
        onSuccess: () => {
          setDeleteTarget(null);
        },
        invalidateQueryKeys: [groupsKey],
      }),
    },
    queryClient,
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ groupId: deleteTarget.id });
  };

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: t("boardGroups.signInPrompt"),
          forceRedirectUrl: "/board-groups",
        }}
        title={t("boardGroups.title")}
        description={`${t("boardGroups.description")} ${groups.length} ${t("boardGroups.countSummary")}.`}
        headerActions={
          <Link
            href="/board-groups/new"
            className={buttonVariants({ size: "md", variant: "primary" })}
          >
            {t("boardGroups.createGroup")}
          </Link>
        }
        stickyHeader
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <BoardGroupsTable
            groups={groups}
            isLoading={groupsQuery.isLoading}
            sorting={sorting}
            onSortingChange={onSortingChange}
            showActions
            stickyHeader
            onDelete={setDeleteTarget}
            emptyState={{
              title: t("boardGroups.noGroups"),
              description: t("boardGroups.noGroupsDesc"),
              actionHref: "/board-groups/new",
              actionLabel: t("boardGroups.createFirst"),
            }}
          />
        </div>

        {groupsQuery.error ? (
          <p className="mt-4 text-sm text-red-500">
            {groupsQuery.error.message}
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
        ariaLabel={t("boardGroups.deleteGroup")}
        title={t("boardGroups.deleteGroup")}
        description={
          <>
            {t("boardGroups.deleteConfirm")}
          </>
        }
        errorMessage={deleteMutation.error?.message}
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
