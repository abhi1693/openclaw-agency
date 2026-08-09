import type { GuardStatusSummary, HonestStatusMap } from "./statusModel";
import type { HonestStatus } from "./schema";

export type WhyStatusSection = {
  status: HonestStatus;
  reasons: string[];
  proofs?: string[];
};

export type WhyStatus = Record<"console" | "chatgpt" | "kevin" | "external" | "execute" | "guards", WhyStatusSection>;

export const buildWhyStatus = ({
  chatgptBriefPath,
  executeApprovalRequired,
  guardSummary,
  honestStatus,
  kevinPacketPath,
  packetPath,
  responsePath,
}: {
  chatgptBriefPath?: string | null;
  executeApprovalRequired: boolean;
  guardSummary: GuardStatusSummary;
  honestStatus: HonestStatusMap;
  kevinPacketPath?: string | null;
  packetPath?: string | null;
  responsePath?: string | null;
}): WhyStatus => ({
  console: {
    status: honestStatus.console,
    reasons: [
      "packet store local ready",
      "worker response path configured",
      "no external API required",
    ],
    proofs: [packetPath, responsePath].filter(Boolean) as string[],
  },
  chatgpt: {
    status: honestStatus.chatgpt,
    reasons: [
      "ChatGPT Desktop — brief local, aucune API OpenAI",
      "no OPENAI_API_KEY from Central Brain lane",
      "no api.openai.com call from console route",
    ],
    proofs: chatgptBriefPath ? [chatgptBriefPath] : [],
  },
  kevin: {
    status: honestStatus.kevin,
    reasons: [
      "Kevin/Gemini — perception one-shot",
      "screen/camera/audio are local packet attachments",
      "no continuous camera or microphone",
    ],
    proofs: kevinPacketPath ? [kevinPacketPath] : [],
  },
  external: {
    status: honestStatus.external,
    reasons: ["Externe verrouillé", "no hidden external send", "draft/local packet only in this phase"],
  },
  execute: {
    status: honestStatus.execute,
    reasons: executeApprovalRequired
      ? ["Action réelle : validation requise", "EXECUTE packet stored locally only", "no real execution dispatched"]
      : ["No external execution requested", "local packet route only"],
  },
  guards: {
    status: honestStatus.guards,
    reasons: guardSummary.reasons,
  },
});
