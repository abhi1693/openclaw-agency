export type SessionInspectDetails = {
  title: string;
  model: string | null;
  activeToolCount: number | null;
  sessionConfig: string | null;
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const readString = (
  record: Record<string, unknown> | null,
  keys: string[],
): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
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
    const value = record[key];
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
    const value = record[key];
    if (Array.isArray(value)) return value.length;
  }
  return null;
};

const stringifySessionConfig = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
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
): SessionInspectDetails => {
  const record = toRecord(session);
  const model = readString(record, ["model", "model_name", "provider", "engine"]);
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
    model,
    activeToolCount,
    sessionConfig,
  };
};
