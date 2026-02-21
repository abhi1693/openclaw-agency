"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/mutator";
import {
  type listOrgCustomFieldsApiV1OrganizationsMeCustomFieldsGetResponse,
  getListOrgCustomFieldsApiV1OrganizationsMeCustomFieldsGetQueryKey,
  useDeleteOrgCustomFieldApiV1OrganizationsMeCustomFieldsTaskCustomFieldDefinitionIdDelete,
  useListOrgCustomFieldsApiV1OrganizationsMeCustomFieldsGet,
} from "@/api/generated/org-custom-fields/org-custom-fields";
import type { TaskCustomFieldDefinitionRead } from "@/api/generated/model";
import { CustomFieldsTable } from "@/components/custom-fields/CustomFieldsTable";
import { extractApiErrorMessage } from "@/components/custom-fields/custom-field-form-utils";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useUrlSorting } from "@/lib/use-url-sorting";

const CUSTOM_FIELD_SORTABLE_COLUMNS = ["field_key", "required", "updated_at"];

export default function CustomFieldsPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { sorting, onSortingChange } = useUrlSorting({
    allowedColumnIds: CUSTOM_FIELD_SORTABLE_COLUMNS,
    defaultSorting: [{ id: "field_key", desc: false }],
    paramPrefix: "custom_fields",
  });

  const [deleteTarget, setDeleteTarget] =
    useState<TaskCustomFieldDefinitionRead | null>(null);

  const customFieldsQuery =
    useListOrgCustomFieldsApiV1OrganizationsMeCustomFieldsGet<
      listOrgCustomFieldsApiV1OrganizationsMeCustomFieldsGetResponse,
      ApiError
    >({
      query: {
        enabled: Boolean(isSignedIn),
        refetchOnMount: "always",
        refetchInterval: 30_000,
      },
    });
  const customFields = useMemo(
    () =>
      customFieldsQuery.data?.status === 200
        ? (customFieldsQuery.data.data ?? [])
        : [],
    [customFieldsQuery.data],
  );
  const customFieldsKey =
    getListOrgCustomFieldsApiV1OrganizationsMeCustomFieldsGetQueryKey();

  const deleteMutation =
    useDeleteOrgCustomFieldApiV1OrganizationsMeCustomFieldsTaskCustomFieldDefinitionIdDelete<ApiError>(
      {
        mutation: {
          onSuccess: async () => {
            setDeleteTarget(null);
            await queryClient.invalidateQueries({ queryKey: customFieldsKey });
          },
        },
      },
    );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ taskCustomFieldDefinitionId: deleteTarget.id });
  };

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: t("customFields.signInPrompt"),
          forceRedirectUrl: "/custom-fields",
          signUpForceRedirectUrl: "/custom-fields",
        }}
        title={t("customFields.title")}
        description={`${customFields.length} ${t("customFields.countSummary")}.`}
        headerActions={
          isAdmin ? (
            <Link
              href="/custom-fields/new"
              className={buttonVariants({ size: "md", variant: "primary" })}
            >
              {t("customFields.addField")}
            </Link>
          ) : null
        }
        isAdmin={isAdmin}
        adminOnlyMessage={t("customFields.adminOnly")}
        stickyHeader
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <CustomFieldsTable
            fields={customFields}
            isLoading={customFieldsQuery.isLoading}
            sorting={sorting}
            onSortingChange={onSortingChange}
            stickyHeader
            editHref={
              isAdmin ? (field) => `/custom-fields/${field.id}/edit` : undefined
            }
            onDelete={isAdmin ? setDeleteTarget : undefined}
            emptyState={{
              title: t("customFields.noFields"),
              description: t("customFields.noFieldsDesc"),
              actionHref: isAdmin ? "/custom-fields/new" : undefined,
              actionLabel: isAdmin ? t("customFields.createFirst") : undefined,
            }}
          />
        </div>
        {customFieldsQuery.error ? (
          <p className="mt-4 text-sm text-rose-600">
            {customFieldsQuery.error.message}
          </p>
        ) : null}
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        ariaLabel={t("customFields.deleteField")}
        title={t("customFields.deleteField")}
        description={
          <>
            {t("customFields.deleteConfirmPrefix")} <strong>{deleteTarget?.field_key}</strong>.{" "}
            {t("customFields.deleteConfirmSuffix")}
          </>
        }
        errorMessage={
          deleteMutation.error
            ? extractApiErrorMessage(
                deleteMutation.error,
                t("customFields.deleteFailed"),
              )
            : undefined
        }
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
