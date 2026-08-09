import { appendFile, open, readFile, stat as statFile } from "fs/promises";

export const shorten = (value: string, maxChars = 240) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
};

export const appendJsonl = async (filePath: string, value: unknown) => {
  await appendFile(filePath, `${JSON.stringify(value)}\n`, { encoding: "utf8" });
};

export const safeJson = (value: unknown) => JSON.stringify(value, null, 2);

export async function fileExists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function buildPathProof({ id, label, path: filePath }: { id: string; label: string; path?: string | null }) {
  const checkedAt = new Date().toISOString();
  if (!filePath) {
    return {
      id,
      label,
      status: "WATCH",
      checkedAt,
      detail: "non routé / non applicable",
    };
  }
  try {
    const stats = await statFile(filePath);
    return {
      id,
      label,
      status: "OK",
      checkedAt,
      path: filePath,
      sizeBytes: stats.size,
      mtime: stats.mtime.toISOString(),
    };
  } catch {
    return {
      id,
      label,
      status: "MISSING",
      checkedAt,
      path: filePath,
    };
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function readTail(filePath: string, maxBytes = 512 * 1024) {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(filePath, "r");
    const stats = await handle.stat();
    const length = Math.min(stats.size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, Math.max(0, stats.size - length));
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    await handle?.close();
  }
}

export async function readJsonlTail<T = Record<string, unknown>>(filePath: string, maxLines = 240, maxBytes = 512 * 1024) {
  const text = await readTail(filePath, maxBytes);
  return text
    .split("\n")
    .filter(Boolean)
    .slice(-maxLines)
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((item): item is T => item !== null);
}

export const isFileLike = (value: FormDataEntryValue): value is File =>
  typeof value === "object"
  && value !== null
  && "arrayBuffer" in value
  && "name" in value
  && "size" in value;
