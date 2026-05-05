import { buildSessionUsageSummary } from "./session-usage";

export type SessionInspectDetails = {
  title: string;
  sessionId: string;
  provider: string | null;
  model: string | null;
  usage: string;
  activeToolCount: number | null;
  sessionConfig: string | null;
};

const parseJsonField = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  const parsed = parseJsonField(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return null;
  return parsed as Record<string, unknown>;
};

const readString = (
  record: Record<string, unknown> | null,
  keys: string[],
): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = parseJsonField(record[key]);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const readNumber = (
  record: Record<string, unknown> | null,
  keys: string[],
): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = parseJsonField(record[key]);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/[^0-9.-]/g, "");
      const parsed = Number.parseFloat(cleaned);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const readArrayLength = (
  record: Record<string, unknown> | null,
  keys: string[],
): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = parseJsonField(record[key]);
    if (Array.isArray(value)) return value.length;
  }
  return null;
};

const stringifySessionConfig = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = parseJsonField(trimmed);
    if (parsed !== trimmed) value = parsed;
    else return trimmed;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
};

export const buildSessionInspectDetails = (
  session: unknown,
  title: string,
  sessionId: string,
): SessionInspectDetails => {
  const record = toRecord(session);
  const usageRecord = toRecord(record?.usage);
  const statsRecord = toRecord(record?.stats);
  const metricsRecord = toRecord(record?.metrics);
  const candidateRecords = [record, usageRecord, statsRecord, metricsRecord];
  const model = readString(record, ["model", "model_name", "provider", "engine"]);
  const provider =
    readString(record, ["modelProvider", "model_provider", "provider"]) ??
    (model?.split("/")[0] ?? null);
  const usedTokens =
    candidateRecords
      .map((entry) =>
        readNumber(entry, [
          "used",
          "used_tokens",
          "tokens",
          "current",
          "token_count",
          "tokenCount",
          "totalTokens",
          "total_tokens",
          "inputTokens",
          "input_tokens",
        ]),
      )
      .find((value) => value !== null) ?? null;
  const maxTokens =
    candidateRecords
      .map((entry) =>
        readNumber(entry, [
          "max",
          "limit",
          "token_limit",
          "capacity",
          "max_tokens",
          "maxTokens",
          "context_window",
          "contextWindow",
          "contextTokens",
          "context_tokens",
          "maxContextTokens",
          "max_context_tokens",
        ]),
      )
      .find((value) => value !== null) ?? null;
  const pctFromPayload =
    candidateRecords
      .map((entry) =>
        readNumber(entry, [
          "pct",
          "percent",
          "ratio_pct",
          "ratioPct",
          "token_pct",
          "usage_pct",
          "percentUsed",
          "contextPercent",
        ]),
      )
      .find((value) => value !== null) ?? null;
  const activeToolCount =
    readNumber(record, [
      "active_tool_count",
      "activeToolCount",
      "tool_count",
      "toolCount",
      "active_tools_count",
      "activeToolsCount",
    ]) ??
    readArrayLength(record, ["active_tools", "activeTools", "tools", "toolbox"]);
  const sessionConfig = stringifySessionConfig(
    record?.session_config ?? record?.sessionConfig ?? record?.config,
  );

  return {
    title,
    sessionId,
    provider,
    model,
    usage: buildSessionUsageSummary(usedTokens, maxTokens, pctFromPayload).label,
    activeToolCount,
    sessionConfig,
  };
};
