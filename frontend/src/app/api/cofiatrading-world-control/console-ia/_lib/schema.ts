export const SOURCE_TAG = "CONSOLE_IA_LOCAL_PACKET_GREEN_20260529";

export const MAX_MESSAGE_CHARS = 8_000;
export const MAX_REPLY_CHARS = 12_000;
export const MAX_ATTACHMENTS = 8;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 80 * 1024 * 1024;

export const ATTACHMENT_KINDS = ["audio", "camera", "file", "image", "screen"] as const;
export type ConsoleAttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ACTION_MODES = ["ASK", "DRAFT", "PATCH", "PERCEPTION", "EXECUTE"] as const;
export type ConsoleActionMode = (typeof ACTION_MODES)[number];

export const HONEST_STATUSES = [
  "LOCAL_GREEN",
  "DRAFT_ONLY_GREEN",
  "EXTERNAL_LOCKED",
  "EXTERNAL_LIVE",
  "PERCEPTION_READY",
  "BRIEF_ONLY",
  "APPROVAL_REQUIRED",
  "WATCH",
  "BLOCKED",
] as const;
export type HonestStatus = (typeof HONEST_STATUSES)[number];

export type StoredAttachment = {
  id: string;
  kind: ConsoleAttachmentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
  note: string | null;
  storedPath: string | null;
  trust: "UNTRUSTED_INPUT";
};

export type ConsoleModelMode = {
  id: string;
  label: string;
  provider: string;
  model: string;
  reasoning: string;
  execution: string;
  hardlock: string;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asString = (value: unknown) => (typeof value === "string" ? value : "");

export const sanitizeText = (value: string, maxChars = MAX_MESSAGE_CHARS) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxChars);

export const normalizeActionMode = (value: unknown, requestedMode?: unknown): ConsoleActionMode => {
  const raw = sanitizeText(asString(value), 40).toUpperCase();
  if ((ACTION_MODES as readonly string[]).includes(raw)) return raw as ConsoleActionMode;
  const requested = sanitizeText(asString(requestedMode), 80).toLowerCase();
  if (requested.includes("draft")) return "DRAFT";
  if (requested.includes("patch")) return "PATCH";
  if (requested.includes("perception")) return "PERCEPTION";
  if (requested.includes("execute")) return "EXECUTE";
  return "ASK";
};
