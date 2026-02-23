"use client";

import Link from "next/link";
import { Users } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import type { AgentTeamRead } from "./TeamCard";

export function TeamsTable({
  teams,
  isLoading,
  onDelete,
}: {
  teams: AgentTeamRead[];
  isLoading?: boolean;
  onDelete?: (team: AgentTeamRead) => void;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-slate-500">{t("common.loading")}</div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="p-8 text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">{t("teams.noTeams")}</p>
        <p className="mt-1 text-xs text-slate-400">{t("teams.noTeamsDesc")}</p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-left">
          <th className="px-4 py-3 font-medium text-slate-500">{t("teams.teamName")}</th>
          <th className="px-4 py-3 font-medium text-slate-500">{t("teams.teamType")}</th>
          <th className="px-4 py-3 font-medium text-slate-500">{t("teams.members")}</th>
          <th className="px-4 py-3 font-medium text-slate-500">{t("common.actions")}</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((team) => (
          <tr key={team.id} className="border-b border-slate-50 hover:bg-slate-50">
            <td className="px-4 py-3">
              <Link
                href={`/teams/${team.id}`}
                className="font-medium text-slate-900 hover:text-blue-600"
              >
                {team.name}
              </Link>
              {team.description ? (
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                  {team.description}
                </p>
              ) : null}
            </td>
            <td className="px-4 py-3 text-slate-600">
              {t(`teams.teamTypes.${team.team_type}` as Parameters<typeof t>[0]) ?? team.team_type}
            </td>
            <td className="px-4 py-3 text-slate-600">
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                {team.member_count}
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <Link
                  href={`/teams/${team.id}/edit`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {t("common.edit")}
                </Link>
                {onDelete ? (
                  <button
                    onClick={() => onDelete(team)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    {t("common.delete")}
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
