"use client";

import { AgentRoleBadge } from "./AgentRoleBadge";
import { useTranslation } from "@/lib/i18n";

export type AgentTeamMemberRead = {
  id: string;
  team_id: string;
  agent_id: string;
  agent_name: string | null;
  role_in_team: string;
  capabilities: string[] | null;
  joined_at: string;
};

export function TeamMemberGrid({
  members,
  onRemove,
}: {
  members: AgentTeamMemberRead[];
  onRemove?: (agentId: string) => void;
}) {
  const { t } = useTranslation();

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        {t("teams.noMembers")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((member) => (
        <div
          key={member.id}
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            {(member.agent_name ?? "?")[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-medium text-slate-900">
                {member.agent_name ?? member.agent_id}
              </p>
              {onRemove ? (
                <button
                  onClick={() => onRemove(member.agent_id)}
                  className="flex-shrink-0 text-xs text-slate-400 hover:text-red-500"
                  title={t("teams.removeMember")}
                >
                  ✕
                </button>
              ) : null}
            </div>
            <div className="mt-1">
              <AgentRoleBadge role={member.role_in_team} />
            </div>
            {member.capabilities && member.capabilities.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {member.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
