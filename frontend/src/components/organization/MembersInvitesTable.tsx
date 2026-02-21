import { useMemo } from "react";

import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Copy } from "lucide-react";

import type {
  OrganizationInviteRead,
  OrganizationMemberRead,
} from "@/api/generated/model";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { formatTimestamp } from "@/lib/formatters";

type MemberInviteRow =
  | { kind: "member"; member: OrganizationMemberRead }
  | { kind: "invite"; invite: OrganizationInviteRead };

type MembersInvitesTableProps = {
  members: OrganizationMemberRead[];
  invites: OrganizationInviteRead[];
  isLoading: boolean;
  isAdmin: boolean;
  copiedInviteId: string | null;
  onManageAccess: (memberId: string) => void;
  onCopyInvite: (invite: OrganizationInviteRead) => void;
  onRevokeInvite: (inviteId: string) => void;
  isRevoking: boolean;
};

const roleBadgeVariant = (role: string) => {
  if (role === "admin" || role === "owner") return "accent" as const;
  return "outline" as const;
};

const initialsFrom = (value?: string | null) => {
  if (!value) return "?";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const summarizeAccess = (
  allRead: boolean,
  allWrite: boolean,
  t: (key: string) => string,
) => {
  if (allRead || allWrite) {
    if (allRead && allWrite) return t("organization.allBoardsReadWrite");
    if (allWrite) return t("organization.allBoardsWrite");
    return t("organization.allBoardsRead");
  }
  return t("organization.selectedBoards");
};

const memberDisplay = (
  member: OrganizationMemberRead,
  noEmailLabel: string,
) => {
  const primary =
    member.user?.name ||
    member.user?.preferred_name ||
    member.user?.email ||
    member.user_id;
  const secondary = member.user?.email ?? noEmailLabel;
  return {
    primary,
    secondary,
    initials: initialsFrom(primary),
  };
};

export function MembersInvitesTable({
  members,
  invites,
  isLoading,
  isAdmin,
  copiedInviteId,
  onManageAccess,
  onCopyInvite,
  onRevokeInvite,
  isRevoking,
}: MembersInvitesTableProps) {
  const { t } = useTranslation();

  const rows = useMemo<MemberInviteRow[]>(
    () => [
      ...members.map((member) => ({ kind: "member" as const, member })),
      ...invites.map((invite) => ({ kind: "invite" as const, invite })),
    ],
    [invites, members],
  );

  const columns = useMemo<ColumnDef<MemberInviteRow>[]>(
    () => [
      {
        id: "member",
        header: t("common.name"),
        cell: ({ row }) => {
          if (row.original.kind === "member") {
            const display = memberDisplay(
              row.original.member,
              t("organization.noEmail"),
            );
            return (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-xs font-semibold text-white">
                  {display.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {display.primary}
                  </div>
                  <div className="text-xs text-slate-500">
                    {display.secondary}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-xs font-semibold text-slate-600">
                {initialsFrom(row.original.invite.invited_email)}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {row.original.invite.invited_email}
                </div>
                <div className="text-xs text-slate-500">
                  {t("common.created")}{" "}
                  {formatTimestamp(row.original.invite.created_at)}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        header: t("common.status"),
        cell: ({ row }) => {
          if (row.original.kind === "member") {
            return (
              <Badge variant={roleBadgeVariant(row.original.member.role)}>
                {row.original.member.role}
              </Badge>
            );
          }

          return (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">{t("organization.pendingStatus")}</Badge>
              <Badge variant={roleBadgeVariant(row.original.invite.role)}>
                {row.original.invite.role}
              </Badge>
            </div>
          );
        },
      },
      {
        id: "access",
        header: t("organization.boardAccess"),
        cell: ({ row }) => (
          <span className="text-slate-600">
            {row.original.kind === "member"
              ? summarizeAccess(
                  row.original.member.all_boards_read,
                  row.original.member.all_boards_write,
                  t,
                )
              : summarizeAccess(
                  row.original.invite.all_boards_read,
                  row.original.invite.all_boards_write,
                  t,
                )}
          </span>
        ),
      },
      {
        id: "actions",
        header: t("common.actions"),
        cell: ({ row }) => {
          if (row.original.kind === "member") {
            const member = row.original.member;
            if (!isAdmin) {
              return (
                <span className="text-xs text-slate-400">
                  {t("organization.adminOnlyAction")}
                </span>
              );
            }
            return (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onManageAccess(member.id)}
                >
                  {t("organization.manageAccess")}
                </Button>
              </div>
            );
          }

          const invite = row.original.invite;
          return (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onCopyInvite(invite)}
              >
                <Copy className="h-4 w-4" />
                {copiedInviteId === invite.id
                  ? t("common.copied")
                  : t("common.copyLink")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRevokeInvite(invite.id)}
                disabled={isRevoking}
              >
                {t("common.revoke")}
              </Button>
            </div>
          );
        },
      },
    ],
    [
      copiedInviteId,
      isAdmin,
      isRevoking,
      onCopyInvite,
      onManageAccess,
      onRevokeInvite,
      t,
    ],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DataTable
      table={table}
      isLoading={isLoading}
      loadingLabel={t("organization.loadingMembers")}
      emptyMessage={t("organization.noMembersYet")}
      headerClassName="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"
      headerCellClassName="px-5 py-3 text-left font-medium"
      cellClassName="px-5 py-4"
      rowClassName={(row) =>
        row.original.kind === "invite"
          ? "border-t border-slate-200 bg-slate-50/60"
          : "border-t border-slate-200 hover:bg-slate-50"
      }
    />
  );
}
