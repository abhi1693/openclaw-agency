"use client";

import Link from "next/link";
import { Users } from "lucide-react";

import { useTranslation } from "@/lib/i18n";

export type AgentTeamRead = {
  id: string;
  organization_id: string;
  board_id: string | null;
  name: string;
  description: string | null;
  team_type: string;
  config: Record<string, unknown> | null;
  member_count: number;
  created_at: string;
  updated_at: string;
};

const TEAM_TYPE_COLORS: Record<string, string> = {
  task_force: "bg-orange-50 text-orange-700",
  review_committee: "bg-purple-50 text-purple-700",
  specialist_pool: "bg-blue-50 text-blue-700",
  custom: "bg-slate-50 text-slate-600",
};

export function TeamCard({ team }: { team: AgentTeamRead }) {
  const { t } = useTranslation();

  const typeLabel =
    t(`teams.teamTypes.${team.team_type}` as Parameters<typeof t>[0]) ??
    team.team_type;
  const colorClass = TEAM_TYPE_COLORS[team.team_type] ?? "bg-slate-50 text-slate-600";

  return (
    <Link href={`/teams/${team.id}`} className="block group">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md group-focus:ring-2 group-focus:ring-blue-500">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
              >
                {typeLabel}
              </span>
            </div>
            <h3 className="mt-2 truncate font-semibold text-slate-900 group-hover:text-blue-600">
              {team.name}
            </h3>
            {team.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                {team.description}
              </p>
            ) : (
              <p className="mt-1 text-sm italic text-slate-400">
                {t("common.noDescription")}
              </p>
            )}
          </div>
          <div className="flex-shrink-0 rounded-lg bg-blue-50 p-2 text-blue-600">
            <Users className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1 text-sm text-slate-500">
          <Users className="h-3.5 w-3.5" />
          <span>
            {team.member_count}{" "}
            {t("teams.members")}
          </span>
        </div>
      </div>
    </Link>
  );
}
