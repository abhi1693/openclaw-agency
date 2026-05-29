import { NextResponse } from "next/server";

import { readLocalRevenue } from "../_lib/localRevenue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FetchResult = {
  ok: boolean;
  status: number | null;
  data: unknown;
  error: string | null;
};

const OPENCLAW_API =
  process.env.OPENCLAW_BACKEND_INTERNAL_URL ?? "http://backend:8000";
const LOCAL_AUTH_TOKEN = process.env.LOCAL_AUTH_TOKEN;
// REVENUE_URL Abidjan :8430 COUPÉ 20260529 → revenue lu en local via readLocalRevenue (cof_state.json).

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readString = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const readNumber = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const pageItems = (data: unknown): Record<string, unknown>[] => {
  if (Array.isArray(data)) return data.filter((item) => typeof item === "object") as Record<string, unknown>[];
  const record = toRecord(data);
  const items = record.items;
  return Array.isArray(items)
    ? (items.filter((item) => typeof item === "object") as Record<string, unknown>[])
    : [];
};

const fetchJson = async (
  url: string,
  init: RequestInit = {},
  timeoutMs = 5000,
): Promise<FetchResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? null : text.slice(0, 240),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      data: null,
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const openClaw = async (
  path: string,
  init: RequestInit = {},
): Promise<FetchResult> => {
  if (!LOCAL_AUTH_TOKEN) {
    return {
      ok: false,
      status: null,
      data: null,
      error: "LOCAL_AUTH_TOKEN_NOT_AVAILABLE_TO_REFRESH_ROUTE",
    };
  }

  return fetchJson(`${OPENCLAW_API}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${LOCAL_AUTH_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
};

const findStripeTruck = async () => {
  const boardsResult = await openClaw("/boards");
  if (!boardsResult.ok) {
    return {
      ok: false,
      error: `OPENCLAW_BOARDS_${boardsResult.status ?? "NO_STATUS"}:${boardsResult.error}`,
    };
  }

  const garageBoard = pageItems(boardsResult.data).find(
    (board) => readString(board, ["slug"]) === "garage-trucks",
  );
  const boardId = garageBoard ? readString(garageBoard, ["id"]) : null;
  if (!boardId) {
    return { ok: false, error: "GARAGE_TRUCKS_BOARD_NOT_FOUND" };
  }

  const tasksResult = await openClaw(`/boards/${boardId}/tasks`);
  if (!tasksResult.ok) {
    return {
      ok: false,
      error: `GARAGE_TRUCKS_TASKS_${tasksResult.status ?? "NO_STATUS"}:${tasksResult.error}`,
    };
  }

  const stripeTask = pageItems(tasksResult.data).find((task) => {
    const fields = toRecord(task.custom_field_values);
    return (
      readString(fields, ["truck_id"]) === "stripetruck" ||
      readString(fields, ["truck_id"]) === "stripe-truck" ||
      readString(fields, ["truck_name"]) === "StripeTruck"
    );
  });
  const taskId = stripeTask ? readString(stripeTask, ["id"]) : null;
  if (!stripeTask || !taskId) {
    return { ok: false, error: "STRIPETRUCK_TASK_NOT_FOUND" };
  }

  return { ok: true, boardId, taskId, task: stripeTask };
};

export async function POST() {
  const stripe = await findStripeTruck();
  if (!stripe.ok || !stripe.boardId || !stripe.taskId) {
    return NextResponse.json({ ok: false, error: stripe.error }, { status: 502 });
  }

  const revenueResult = await readLocalRevenue();
  if (!revenueResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `LOCAL_REVENUE_COF_STATE_${revenueResult.status ?? "NO_STATUS"}:${revenueResult.error}`,
      },
      { status: 502 },
    );
  }

  const revenue = toRecord(revenueResult.data);
  const timestamp = new Date().toISOString();
  const mrr = readNumber(revenue, ["mrr_eur", "mrr_active_eur"]);
  const vip = readNumber(revenue, ["active_vip"]);
  const pastDue = readNumber(revenue, ["past_due_eur", "past_due_eur_total"]);
  const lastProof = `MRR=${mrr ?? "UNKNOWN"} EUR · VIP=${vip ?? "UNKNOWN"} · past_due=${pastDue ?? "UNKNOWN"} EUR · src=cof_state-local (no-abidjan) · ts=${timestamp}`;

  const fields = toRecord(stripe.task.custom_field_values);
  const customFieldValues = {
    ...fields,
    last_proof: lastProof,
    last_run_at: timestamp,
    last_payload_summary: `MRR=${mrr ?? "UNKNOWN"} EUR; VIP=${vip ?? "UNKNOWN"}; past_due=${pastDue ?? "UNKNOWN"} EUR`,
  };
  const patchResult = await openClaw(`/boards/${stripe.boardId}/tasks/${stripe.taskId}`, {
    method: "PATCH",
    body: JSON.stringify({
      custom_field_values: customFieldValues,
    }),
  });

  if (!patchResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `OPENCLAW_PATCH_${patchResult.status ?? "NO_STATUS"}:${patchResult.error}`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      sourceTag: "COFIATRADING_STRIPETRUCK_LAST_PROOF_REFRESH_20260525",
      boardId: stripe.boardId,
      taskId: stripe.taskId,
      lastProof,
      lastRunAt: timestamp,
      patchStatus: patchResult.status,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
