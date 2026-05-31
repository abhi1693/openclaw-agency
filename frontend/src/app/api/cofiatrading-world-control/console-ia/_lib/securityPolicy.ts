import path from "path";

import {
  ATTACHMENT_KINDS,
  MAX_ATTACHMENT_BYTES,
  asString,
  sanitizeText,
  type ConsoleAttachmentKind,
  type StoredAttachment,
} from "./schema";

const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,80}$/;
const SAFE_EXTENSION_RE = /^[a-z0-9]{1,12}$/;

const MIME_ALLOWLIST = new Set([
  "application/json",
  "application/pdf",
  "application/octet-stream", // Phase 1.5: autorisé seulement pour kind=file; à resserrer Phase 2.
  "application/zip",
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

const EXTENSION_ALLOWLIST = new Set([
  "aac",
  "csv",
  "gif",
  "jpeg",
  "jpg",
  "json",
  "log",
  "m4a",
  "md",
  "mp3",
  "ogg",
  "pdf",
  "png",
  "txt",
  "wav",
  "webm",
  "webp",
  "zip",
]);

export type AttachmentInput = {
  id?: unknown;
  kind?: unknown;
  name?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  capturedAt?: unknown;
  note?: unknown;
};

export type NormalizedAttachment = StoredAttachment & { file?: File };

export const sanitizeFileName = (value: string) => {
  const cleaned = (sanitizeText(value, 160) || "unnamed")
    .replace(/[\\/:"*?<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.\.+/g, ".")
    .slice(0, 160);
  return cleaned || "unnamed";
};

export const validateAttachmentId = (value: unknown, fallback: string) => {
  const raw = sanitizeText(asString(value), 100);
  if (!raw) return { ok: true as const, value: fallback };
  if (raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
    return { ok: false as const, error: "ATTACHMENT_ID_PATH_TRAVERSAL_BLOCKED" };
  }
  if (!SAFE_ID_RE.test(raw)) {
    return { ok: false as const, error: "ATTACHMENT_ID_UNSAFE_BLOCKED" };
  }
  return { ok: true as const, value: raw };
};

export const extensionFromName = (name: string) => {
  const ext = path.extname(name).replace(".", "").toLowerCase();
  return SAFE_EXTENSION_RE.test(ext) ? ext : "";
};

export const validateMimeAndExtension = (mimeType: string, fileName: string, kind: ConsoleAttachmentKind) => {
  const ext = extensionFromName(fileName);
  if (ext && !EXTENSION_ALLOWLIST.has(ext)) {
    return { ok: false as const, error: "ATTACHMENT_EXTENSION_BLOCKED" };
  }
  const normalizedMime = mimeType.toLowerCase();
  const mimeOk = MIME_ALLOWLIST.has(normalizedMime) || normalizedMime.startsWith("text/");
  if (!mimeOk) {
    return { ok: false as const, error: "ATTACHMENT_MIME_BLOCKED" };
  }
  if (normalizedMime === "application/octet-stream" && kind !== "file") {
    return { ok: false as const, error: "ATTACHMENT_OCTET_STREAM_KIND_BLOCKED" };
  }
  if ((kind === "image" || kind === "camera" || kind === "screen") && !normalizedMime.startsWith("image/")) {
    return { ok: false as const, error: "ATTACHMENT_KIND_MIME_MISMATCH" };
  }
  if (kind === "audio" && !normalizedMime.startsWith("audio/")) {
    return { ok: false as const, error: "ATTACHMENT_KIND_MIME_MISMATCH" };
  }
  return { ok: true as const };
};

const inferKind = (inputKind: string, file?: File): ConsoleAttachmentKind | string => {
  if (inputKind) return inputKind;
  if (!file) return "file";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
};

export const normalizeAttachment = (input: AttachmentInput, file: File | undefined, index: number) => {
  const kind = inferKind(asString(input.kind), file);
  const sizeBytes = file
    ? file.size
    : typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes)
      ? Math.max(0, Math.round(input.sizeBytes))
      : -1;

  if (!(ATTACHMENT_KINDS as readonly string[]).includes(kind)) {
    return { ok: false as const, error: `ATTACHMENT_KIND_${kind || "UNKNOWN"}_BLOCKED` };
  }
  if (sizeBytes < 0 || sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { ok: false as const, error: "ATTACHMENT_SIZE_BLOCKED" };
  }

  const attachmentKind = kind as ConsoleAttachmentKind;
  const idResult = validateAttachmentId(input.id, `att_${Date.now()}_${index}`);
  if (!idResult.ok) return idResult;

  const name = sanitizeFileName(file?.name || asString(input.name) || "unnamed");
  const mimeType = sanitizeText(file?.type || asString(input.mimeType) || "application/octet-stream", 120);
  const mimeResult = validateMimeAndExtension(mimeType, name, attachmentKind);
  if (!mimeResult.ok) return mimeResult;

  return {
    ok: true as const,
    value: {
      id: idResult.value,
      kind: attachmentKind,
      name,
      mimeType,
      sizeBytes,
      capturedAt: sanitizeText(asString(input.capturedAt), 80) || new Date().toISOString(),
      note: input.note ? sanitizeText(asString(input.note), 300) : null,
      storedPath: null,
      trust: "UNTRUSTED_INPUT" as const,
      file,
    },
  };
};

export const safeJoinInside = (baseDir: string, fileName: string) => {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, fileName);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
    return { ok: false as const, error: "PATH_TRAVERSAL_BLOCKED" };
  }
  return { ok: true as const, path: resolvedTarget };
};
