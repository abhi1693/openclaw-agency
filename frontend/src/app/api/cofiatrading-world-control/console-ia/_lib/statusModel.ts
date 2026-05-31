import type { ConsoleActionMode, ConsoleModelMode, HonestStatus } from "./schema";

export type GuardStatusSummary = {
  routeCoherence: HonestStatus;
  sessionCoach: HonestStatus;
  selfChallenge: HonestStatus;
  paidApiGuard: HonestStatus;
  reasons: string[];
};

export type HonestStatusMap = {
  console: HonestStatus;
  chatgpt: HonestStatus;
  kevin: HonestStatus;
  external: HonestStatus;
  execute: HonestStatus;
  guards: HonestStatus;
};

export type StatusBadge = {
  id: string;
  label: string;
  status: HonestStatus;
  tone: "green" | "cyan" | "amber" | "red" | "slate";
  detail: string;
};

export const statusTone = (status: HonestStatus): StatusBadge["tone"] => {
  if (status === "LOCAL_GREEN" || status === "DRAFT_ONLY_GREEN") return "green";
  if (status === "PERCEPTION_READY" || status === "BRIEF_ONLY") return "cyan";
  if (status === "WATCH" || status === "APPROVAL_REQUIRED" || status === "EXTERNAL_LOCKED") return "amber";
  if (status === "BLOCKED") return "red";
  return "slate";
};

export const deriveHonestStatus = ({
  actionMode,
  approvalGranted,
  guardSummary,
  modelMode,
  routeBuses,
}: {
  actionMode: ConsoleActionMode;
  approvalGranted: boolean;
  guardSummary: GuardStatusSummary;
  modelMode?: ConsoleModelMode | null;
  routeBuses: string[];
}) => {
  const buses = new Set(routeBuses);
  const chatgptActive = buses.has("chatgpt") || modelMode?.id === "chatgpt_desktop";
  const kevinActive = buses.has("kevin") || modelMode?.id === "kevin_gemini";
  const executeStatus: HonestStatus = actionMode === "EXECUTE" && !approvalGranted ? "APPROVAL_REQUIRED" : "LOCAL_GREEN";
  const guardStatuses = [
    guardSummary.routeCoherence,
    guardSummary.sessionCoach,
    guardSummary.selfChallenge,
    guardSummary.paidApiGuard,
  ];
  const guards: HonestStatus = guardStatuses.includes("BLOCKED")
    ? "BLOCKED"
    : guardStatuses.includes("WATCH")
      ? "WATCH"
      : "LOCAL_GREEN";
  const honestStatus: HonestStatusMap = {
    console: "LOCAL_GREEN",
    chatgpt: chatgptActive ? "BRIEF_ONLY" : "EXTERNAL_LOCKED",
    kevin: kevinActive ? "PERCEPTION_READY" : "EXTERNAL_LOCKED",
    external: "EXTERNAL_LOCKED",
    execute: executeStatus,
    guards,
  };
  const statusBadges: StatusBadge[] = [
    { id: "console", label: "Console", status: honestStatus.console, tone: statusTone(honestStatus.console), detail: "Packet local durable" },
    { id: "chatgpt", label: "ChatGPT Desktop", status: honestStatus.chatgpt, tone: statusTone(honestStatus.chatgpt), detail: "Brief local, aucune API OpenAI" },
    { id: "kevin", label: "Kevin/Gemini", status: honestStatus.kevin, tone: statusTone(honestStatus.kevin), detail: "Perception one-shot si routé" },
    { id: "external", label: "Externe", status: honestStatus.external, tone: statusTone(honestStatus.external), detail: "Transport externe verrouillé" },
    { id: "execute", label: "Action réelle", status: honestStatus.execute, tone: statusTone(honestStatus.execute), detail: executeStatus === "APPROVAL_REQUIRED" ? "Validation humaine requise" : "Pas d’exécution externe" },
    { id: "guards", label: "Guards", status: honestStatus.guards, tone: statusTone(honestStatus.guards), detail: guardSummary.reasons.slice(0, 2).join(" · ") },
  ];
  return { honestStatus, statusBadges };
};
