import type { ConsoleActionMode, HonestStatus, StoredAttachment } from "./schema";

export type PacketTimelineEvent = {
  id: string;
  type: string;
  label: string;
  status: HonestStatus | "INFO";
  timestamp: string;
  agent?: string;
  bus?: string;
  localPath?: string | null;
  hash?: string | null;
  details?: string;
  surface?: "local" | "external" | "draft_only";
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asString = (value: unknown) => (typeof value === "string" ? value : "");

export const makeTimelineEvent = (event: PacketTimelineEvent) => event;

export const buildPacketTimeline = ({
  actionMode,
  approvalRequired,
  guardStatus,
  packet,
  packetHash,
  responses,
}: {
  actionMode: ConsoleActionMode;
  approvalRequired: boolean;
  guardStatus: HonestStatus;
  packet: Record<string, unknown>;
  packetHash?: string | null;
  responses: Record<string, unknown>[];
}) => {
  const packetId = asString(packet.packetId);
  const createdAt = asString(packet.createdAt) || new Date().toISOString();
  const paths = asRecord(packet.paths);
  const input = asRecord(packet.input);
  const attachments = Array.isArray(input.attachments) ? input.attachments.filter((item) => typeof item === "object" && item !== null) as StoredAttachment[] : [];
  const routes = Array.isArray(packet.routes) ? packet.routes.filter((item) => typeof item === "object" && item !== null).map(asRecord) : [];
  const chatgptBriefPath = asString(paths.chatgptBriefPath);
  const kevinPacketPath = asString(paths.kevinPacketPath);
  const events: PacketTimelineEvent[] = [
    {
      id: `${packetId}:packet_created`,
      type: "packet_created",
      label: "Packet créé",
      status: "LOCAL_GREEN",
      timestamp: createdAt,
      localPath: asString(paths.packetPath),
      hash: packetHash ?? asString(packet.packetHash),
      surface: "local",
    },
    {
      id: `${packetId}:attachments_validated`,
      type: "attachments_validated",
      label: "Pièces jointes validées",
      status: "LOCAL_GREEN",
      timestamp: createdAt,
      details: `${attachments.length} attachment(s), tous marqués UNTRUSTED_INPUT`,
      surface: "local",
    },
    {
      id: `${packetId}:attachments_stored`,
      type: "attachments_stored",
      label: "Pièces jointes stockées",
      status: "LOCAL_GREEN",
      timestamp: createdAt,
      localPath: asString(paths.uploadDir),
      details: `${attachments.filter((item) => item.storedPath).length}/${attachments.length} fichier(s) stocké(s)`,
      surface: "local",
    },
    {
      id: `${packetId}:route_planned`,
      type: "route_planned",
      label: approvalRequired ? "Route gelée avant exécution" : "Route calculée",
      status: approvalRequired ? "APPROVAL_REQUIRED" : "LOCAL_GREEN",
      timestamp: createdAt,
      details: routes.map((route) => asString(route.bus)).filter(Boolean).join(", ") || "aucun bus dispatché",
      surface: "local",
    },
    {
      id: `${packetId}:guards_checked`,
      type: "guards_checked",
      label: "Guards vérifiés",
      status: guardStatus,
      timestamp: createdAt,
      details: "paid_api_guard/self_challenge/route/session coach projetés dans whyStatus",
      surface: "local",
    },
  ];

  if (chatgptBriefPath) {
    events.push({
      id: `${packetId}:chatgpt_brief_written`,
      type: "chatgpt_brief_written",
      label: "Brief ChatGPT écrit",
      status: "BRIEF_ONLY",
      timestamp: createdAt,
      localPath: chatgptBriefPath,
      details: "ChatGPT Desktop brief local, aucune API OpenAI",
      surface: "local",
    });
  }
  if (kevinPacketPath) {
    events.push({
      id: `${packetId}:kevin_packet_written`,
      type: "kevin_packet_written",
      label: "Packet Kevin/Gemini écrit",
      status: "PERCEPTION_READY",
      timestamp: createdAt,
      localPath: kevinPacketPath,
      details: "Perception one-shot via attachments locaux",
      surface: "local",
    });
  }
  events.push({
    id: `${packetId}:mission_packet_written`,
    type: "mission_packet_written",
    label: "Mission packet écrit",
    status: "LOCAL_GREEN",
    timestamp: createdAt,
    localPath: asString(paths.missionPath),
    surface: "local",
  });
  if (approvalRequired && actionMode === "EXECUTE") {
    events.push({
      id: `${packetId}:execute_blocked_approval_required`,
      type: "execute_blocked_approval_required",
      label: "EXECUTE bloqué",
      status: "APPROVAL_REQUIRED",
      timestamp: createdAt,
      details: "Aucune exécution réelle sans validation humaine explicite",
      surface: "local",
    });
  }
  for (const response of responses) {
    const status = asString(response.status).toUpperCase();
    const agent = asString(response.agentId) || "agent";
    const terminal = ["ANSWER", "DONE", "DONE_WITH_WATCH", "BLOCKED", "ERROR"].includes(status);
    events.push({
      id: asString(response.responseId) || `${packetId}:response:${events.length}`,
      type: terminal ? "agent_reply" : "worker_ack",
      label: terminal ? "Réponse agent" : "Worker ACK",
      status: status === "BLOCKED" || status === "ERROR" ? "BLOCKED" : terminal ? "LOCAL_GREEN" : "INFO",
      timestamp: asString(response.createdAt) || createdAt,
      agent,
      hash: asString(response.responseHash),
      details: asString(response.content).slice(0, 160),
      surface: "local",
    });
  }
  events.push({
    id: `${packetId}:final_status`,
    type: "final_status",
    label: approvalRequired ? "Statut final : validation requise" : "Statut final local",
    status: approvalRequired ? "APPROVAL_REQUIRED" : responses.length ? "LOCAL_GREEN" : "WATCH",
    timestamp: new Date().toISOString(),
    details: approvalRequired ? "Packet créé, dispatch réel retenu" : responses.length ? "Thread local avec réponse/ACK" : "En attente ACK worker",
    surface: "local",
  });
  return events;
};
