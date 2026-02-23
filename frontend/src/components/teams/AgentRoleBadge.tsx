"use client";

import { useTranslation } from "@/lib/i18n";

type TeamRole = "leader" | "specialist" | "member" | "reviewer" | string;

const ROLE_COLORS: Record<string, string> = {
  leader: "bg-amber-100 text-amber-800",
  specialist: "bg-blue-100 text-blue-800",
  reviewer: "bg-purple-100 text-purple-800",
  member: "bg-slate-100 text-slate-700",
};

export function AgentRoleBadge({ role }: { role: TeamRole }) {
  const { t } = useTranslation();

  const colorClass = ROLE_COLORS[role] ?? "bg-slate-100 text-slate-700";
  const label = (() => {
    switch (role) {
      case "leader":
        return t("teams.roleLeader");
      case "specialist":
        return t("teams.roleSpecialist");
      case "reviewer":
        return t("teams.roleReviewer");
      default:
        return t("teams.roleMember");
    }
  })();

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {label}
    </span>
  );
}
