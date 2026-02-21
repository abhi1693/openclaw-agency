"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/mutator";
import {
  getListTagsApiV1TagsGetQueryKey,
  type listTagsApiV1TagsGetResponse,
  useDeleteTagApiV1TagsTagIdDelete,
  useListTagsApiV1TagsGet,
} from "@/api/generated/tags/tags";
import type { TagRead } from "@/api/generated/model";
import { TagsTable } from "@/components/tags/TagsTable";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useUrlSorting } from "@/lib/use-url-sorting";

const TAG_SORTABLE_COLUMNS = ["name", "task_count", "updated_at"];

const extractErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
};

export default function TagsPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { sorting, onSortingChange } = useUrlSorting({
    allowedColumnIds: TAG_SORTABLE_COLUMNS,
    defaultSorting: [{ id: "name", desc: false }],
    paramPrefix: "tags",
  });

  const [deleteTarget, setDeleteTarget] = useState<TagRead | null>(null);

  const tagsQuery = useListTagsApiV1TagsGet<
    listTagsApiV1TagsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn),
      refetchOnMount: "always",
      refetchInterval: 30_000,
    },
  });
  const tags = useMemo(
    () =>
      tagsQuery.data?.status === 200 ? (tagsQuery.data.data.items ?? []) : [],
    [tagsQuery.data],
  );
  const tagsKey = getListTagsApiV1TagsGetQueryKey();

  const deleteMutation = useDeleteTagApiV1TagsTagIdDelete({
    mutation: {
      onSuccess: async () => {
        setDeleteTarget(null);
        await queryClient.invalidateQueries({ queryKey: tagsKey });
      },
    },
  });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ tagId: deleteTarget.id });
  };

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: t("tags.signInPrompt"),
          forceRedirectUrl: "/tags",
          signUpForceRedirectUrl: "/tags",
        }}
        title={t("tags.title")}
        description={`${tags.length} ${t("tags.countSummary")}.`}
        headerActions={
          isAdmin ? (
            <Link
              href="/tags/add"
              className={buttonVariants({ size: "md", variant: "primary" })}
            >
              {t("tags.newTag")}
            </Link>
          ) : null
        }
        isAdmin={isAdmin}
        adminOnlyMessage={t("tags.adminOnly")}
        stickyHeader
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TagsTable
            tags={tags}
            isLoading={tagsQuery.isLoading}
            sorting={sorting}
            onSortingChange={onSortingChange}
            stickyHeader
            onEdit={
              isAdmin
                ? (tag) => {
                    router.push(`/tags/${tag.id}/edit`);
                  }
                : undefined
            }
            onDelete={isAdmin ? setDeleteTarget : undefined}
            emptyState={{
              title: t("tags.noTags"),
              description: t("tags.noTagsDesc"),
              actionHref: isAdmin ? "/tags/add" : undefined,
              actionLabel: isAdmin ? t("tags.createFirst") : undefined,
            }}
          />
        </div>
        {tagsQuery.error ? (
          <p className="mt-4 text-sm text-rose-600">
            {tagsQuery.error.message}
          </p>
        ) : null}
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        ariaLabel={t("tags.deleteTag")}
        title={t("tags.deleteTag")}
        description={
          <>
            {t("tags.deleteConfirmPrefix")} <strong>{deleteTarget?.name}</strong>{" "}
            {t("tags.deleteConfirmSuffix")}
          </>
        }
        errorMessage={
          deleteMutation.error
            ? extractErrorMessage(
                deleteMutation.error,
                t("tags.deleteFailed"),
              )
            : undefined
        }
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
