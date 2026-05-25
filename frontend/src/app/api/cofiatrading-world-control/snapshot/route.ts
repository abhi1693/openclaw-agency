import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FetchResult = {
  ok: boolean;
  status: number | null;
  data: unknown;
  error: string | null;
};

const HOST = "http://host.docker.internal";
const OPENCLAW_API =
  process.env.OPENCLAW_BACKEND_INTERNAL_URL ?? "http://backend:8000";
const LOCAL_AUTH_TOKEN = process.env.LOCAL_AUTH_TOKEN;

const endpoints = {
  revenue: process.env.COF_REVENUE_SUMMARY_URL ?? `${HOST}:8430/api/iron/revenue/summary`,
  houses: process.env.COF_CENTRAL_BRAIN_HOUSES_URL ?? `${HOST}:8767/api/central-brain/houses`,
  publisher: process.env.COF_PUBLISHER_STATUS_URL ?? `${HOST}:8540/api/status`,
  ack: process.env.COF_ACK_HEALTH_URL ?? `${HOST}:8443/health`,
  rtk: process.env.COF_RTK_HEALTH_URL ?? `${HOST}:11435/health`,
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

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

const readString = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const readJson = async (url: string): Promise<FetchResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const data = contentType.includes("application/json") ? JSON.parse(text) : { text };
    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? null : text.slice(0, 180),
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

const readOpenClaw = async (path: string): Promise<FetchResult> => {
  if (!LOCAL_AUTH_TOKEN) {
    return {
      ok: false,
      status: null,
      data: null,
      error: "LOCAL_AUTH_TOKEN_NOT_AVAILABLE_TO_FRONTEND_ROUTE",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${OPENCLAW_API}/api/v1${path}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${LOCAL_AUTH_TOKEN}`,
      },
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      data: text ? JSON.parse(text) : null,
      error: response.ok ? null : text.slice(0, 180),
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

const pageItems = (data: unknown): Record<string, unknown>[] => {
  if (Array.isArray(data)) return data.filter((item) => typeof item === "object") as Record<string, unknown>[];
  const record = toRecord(data);
  const items = record.items;
  return Array.isArray(items)
    ? (items.filter((item) => typeof item === "object") as Record<string, unknown>[])
    : [];
};

const readBool = (record: Record<string, unknown>, keys: string[]): boolean | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
};

const readStringArray = (record: Record<string, unknown>, keys: string[]): string[] => {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
};

const sanitizeTask = (task: Record<string, unknown>) => {
  const fields = toRecord(task.custom_field_values);
  return {
    id: readString(task, ["id"]) ?? "UNKNOWN",
    title: readString(task, ["title"]) ?? "UNKNOWN",
    status: readString(task, ["status"]) ?? "UNKNOWN",
    priority: readString(task, ["priority"]) ?? "UNKNOWN",
    boardId: readString(task, ["board_id"]),
    assignedAgentId: readString(task, ["assigned_agent_id"]),
    truckId: readString(fields, ["truck_id"]),
    truckName: readString(fields, ["truck_name"]),
    truckType: readString(fields, ["truck_type"]),
    truckStatus: readString(fields, ["truck_status"]) ?? "UNKNOWN",
    driverAgent: readString(fields, ["driver_agent"]) ?? "UNKNOWN",
    destinationBoard: readString(fields, ["destination_board"]) ?? "UNKNOWN",
    currentJob: readString(fields, ["current_job"]) ?? readString(task, ["title"]) ?? "UNKNOWN",
    route: readString(fields, ["route"]) ?? "UNKNOWN",
    payloadType: readString(fields, ["payload_type"]) ?? "UNKNOWN",
    sourceOfTruth: readString(fields, ["source_of_truth"]) ?? "UNKNOWN",
    lastRunAt: readString(fields, ["last_run_at"]),
    lastPayloadSummary: readString(fields, ["last_payload_summary"]) ?? "UNKNOWN",
    lastProof: readString(fields, ["last_proof"]) ?? "UNKNOWN",
    writeLock: readBool(fields, ["write_lock"]) ?? true,
    approvalGate: readString(fields, ["approval_gate"]) ?? "UNKNOWN",
    arrImpact: readString(fields, ["arr_impact"]) ?? "UNKNOWN",
    riskLevel: readString(fields, ["risk_level"]) ?? "UNKNOWN",
    nextAction: readString(fields, ["next_action"]) ?? "UNKNOWN",
    failureMode: readString(fields, ["failure_mode"]) ?? "",
    owner: readString(fields, ["owner"]) ?? readString(fields, ["driver_agent"]) ?? "UNKNOWN",
    proofRequired: readString(fields, ["proof_required"]) ?? "source_tag + proof",
    oldCityFlag: readBool(fields, ["old_city_flag"]) ?? false,
  };
};

const sanitizeOffer = (task: Record<string, unknown>, revenue: Record<string, unknown>) => {
  const fields = toRecord(task.custom_field_values);
  const offerId = readString(fields, ["offer_id"]);
  if (!offerId) return null;

  const hubPastDueCount = readNumber(revenue, ["past_due_count"]);
  const hubPastDueEur = readNumber(revenue, ["past_due_eur", "past_due_eur_total"]);
  const subsCount =
    offerId === "past_due_recovery"
      ? hubPastDueCount ?? readNumber(fields, ["subs_count"])
      : readNumber(fields, ["subs_count"]);
  const subsProof =
    offerId === "past_due_recovery" && hubPastDueCount !== null
      ? `Hub Iron read-only HTTP 200: past_due_count=${hubPastDueCount}, past_due_eur=${hubPastDueEur ?? "UNKNOWN"}.`
      : readString(fields, ["subs_count_last_proof"]) ?? "UNPROVED_THIS_PHASE";

  return {
    id: readString(task, ["id"]) ?? "UNKNOWN",
    taskTitle: readString(task, ["title"]) ?? "UNKNOWN",
    offerId,
    offerName: readString(fields, ["offer_name"]) ?? readString(task, ["title"]) ?? "UNKNOWN",
    priceEur: readNumber(fields, ["price_eur"]),
    priceLabel: readString(fields, ["price_label"]) ?? "UNKNOWN",
    billingPeriod: readString(fields, ["billing_period"]) ?? "UNKNOWN",
    stripeLink: readString(fields, ["stripe_link"]) ?? "UNKNOWN",
    stripeLinks: readStringArray(fields, ["stripe_links"]),
    statusCanon: readString(fields, ["status_canon"]) ?? "UNKNOWN",
    subsCount,
    subsCountLastProof: subsProof,
    publicUseBlockedAlias: readBool(fields, ["public_use_blocked_alias"]) ?? false,
    homeHouseCanon: readString(fields, ["home_house_canon"]) ?? "UNKNOWN",
    arrImpact: readString(fields, ["arr_impact"]) ?? "UNKNOWN",
    nextAction: readString(fields, ["next_action"]) ?? "UNKNOWN",
    sourceTag: "OFFER_FACTORY_PHASE6_STRIPE_READ_20260525",
    lastRunAt: readString(fields, ["last_run_at"]),
    lastProof: readString(fields, ["last_proof"]) ?? "UNKNOWN",
  };
};

const offerOrder = new Map(
  [
    "vip_standard",
    "academy",
    "premium_dashboard",
    "elite_1on1",
    "katikaan_paliers",
    "corsikaan_paliers",
    "setup_broker_help",
    "past_due_recovery",
  ].map((offerId, index) => [offerId, index]),
);

const knowledgeTruckConfig = [
  { id: "obsidian", truckName: "ObsidianTruck" },
  { id: "notion", truckName: "NotionOpsTruck" },
  { id: "drive", truckName: "DriveDocsTruck" },
] as const;

const sanitizeKnowledgeTruck = (
  id: (typeof knowledgeTruckConfig)[number]["id"],
  truckName: string,
  garageTasks: ReturnType<typeof sanitizeTask>[],
) => {
  const truck = garageTasks.find((task) => task.truckName === truckName);
  return {
    id,
    truckTaskId: truck?.id ?? "UNKNOWN",
    truckName,
    status: truck?.truckStatus ?? "UNKNOWN",
    lastProof: truck?.lastProof ?? "UNKNOWN",
    lastRunAt: truck?.lastRunAt ?? null,
    sourceTag: "KNOWLEDGE_TRUCKS_PHASE7_READONLY_20260525",
    sourceOfTruth: truck?.sourceOfTruth ?? "UNKNOWN",
    nextAction: truck?.nextAction ?? "UNKNOWN",
    proofRequired:
      truck?.proofRequired ?? "sanitized counts only; no PII; no note text; no external writes",
  };
};

export async function GET() {
  const [revenueResult, housesResult, publisherResult, ackResult, rtkResult, boardsResult, agentsResult, fieldsResult] =
    await Promise.all([
      readJson(endpoints.revenue),
      readJson(endpoints.houses),
      readJson(endpoints.publisher),
      readJson(endpoints.ack),
      readJson(endpoints.rtk),
      readOpenClaw("/boards"),
      readOpenClaw("/agents"),
      readOpenClaw("/organizations/me/custom-fields"),
    ]);

  const revenue = toRecord(revenueResult.data);
  const housesPayload = toRecord(housesResult.data);
  const publisher = toRecord(publisherResult.data);

  const houses = Array.isArray(housesPayload.houses) ? housesPayload.houses : [];
  const brokers = toRecord(revenue.brokers);
  const boards = pageItems(boardsResult.data);
  const agents = pageItems(agentsResult.data);
  const customFields = pageItems(fieldsResult.data);
  const garageBoard = boards.find((board) => readString(board, ["slug"]) === "garage-trucks");
  const garageBoardId = garageBoard ? readString(garageBoard, ["id"]) : null;
  const offerBoard = boards.find((board) => readString(board, ["slug"]) === "offer-factory");
  const offerBoardId = offerBoard ? readString(offerBoard, ["id"]) : null;
  const proofBoard = boards.find((board) => readString(board, ["slug"]) === "proof-ledger");
  const boardTaskResults = await Promise.all(
    boards.slice(0, 60).map(async (board) => {
      const boardId = readString(board, ["id"]);
      if (!boardId) return { board, result: { ok: false, status: null, data: null, error: "MISSING_BOARD_ID" } as FetchResult };
      return {
        board,
        result: await readOpenClaw(`/boards/${boardId}/tasks`),
      };
    }),
  );
  const garageTasksResult = garageBoardId
    ? await readOpenClaw(`/boards/${garageBoardId}/tasks`)
    : {
        ok: false,
        status: null,
        data: null,
        error: "GARAGE_TRUCKS_BOARD_NOT_FOUND",
      };
  const garageTasks = pageItems(garageTasksResult.data).map(sanitizeTask);
  const knowledge = Object.fromEntries(
    knowledgeTruckConfig.map((config) => [
      config.id,
      sanitizeKnowledgeTruck(config.id, config.truckName, garageTasks),
    ]),
  );
  const offerTasksResult = offerBoardId
    ? await readOpenClaw(`/boards/${offerBoardId}/tasks`)
    : {
        ok: false,
        status: null,
        data: null,
        error: "OFFER_FACTORY_BOARD_NOT_FOUND",
      };
  const offers = pageItems(offerTasksResult.data)
    .map((task) => sanitizeOffer(task, revenue))
    .filter(Boolean)
    .sort((left, right) => {
      const leftOrder = offerOrder.get(left?.offerId ?? "") ?? 999;
      const rightOrder = offerOrder.get(right?.offerId ?? "") ?? 999;
      return leftOrder - rightOrder;
    });
  const hasOpenClaw = boardsResult.ok && Boolean(garageBoardId) && garageTasksResult.ok;
  const proofApprovals = proofBoard
    ? pageItems((await readOpenClaw(`/boards/${readString(proofBoard, ["id"])}/approvals`)).data)
    : [];
  const buildingSummaries = boardTaskResults.map(({ board, result }) => {
    const tasks = pageItems(result.data).map(sanitizeTask);
    const truckNames = Array.from(new Set(tasks.map((task) => task.truckName).filter(Boolean)));
    return {
      id: readString(board, ["id"]) ?? "UNKNOWN",
      name: readString(board, ["name"]) ?? "UNKNOWN",
      slug: readString(board, ["slug"]) ?? "UNKNOWN",
      activeTasks: tasks.filter((task) => task.status !== "done").length,
      trucks: truckNames.slice(0, 8),
      proof: tasks.some((task) => task.lastProof && task.lastProof !== "UNKNOWN")
        ? "TASK_PROOF_FIELDS"
        : result.ok
          ? "TASKS_READ_NO_PROOF_YET"
          : "UNKNOWN",
      arrImpact: tasks.some((task) => task.arrImpact === "direct") ? "direct" : "indirect",
    };
  });

  return NextResponse.json(
    {
      ok: revenueResult.ok || housesResult.ok || publisherResult.ok,
      fetchedAt: new Date().toISOString(),
      sourceTag: "COFIATRADING_WORLD_CONTROL_READ_ONLY_SNAPSHOT_20260525",
      endpoints: {
        revenue: { ok: revenueResult.ok, status: revenueResult.status },
        houses: { ok: housesResult.ok, status: housesResult.status },
        publisher: { ok: publisherResult.ok, status: publisherResult.status },
        ack: { ok: ackResult.ok, status: ackResult.status },
        rtk: { ok: rtkResult.ok, status: rtkResult.status },
        openclawBoards: { ok: boardsResult.ok, status: boardsResult.status },
        openclawAgents: { ok: agentsResult.ok, status: agentsResult.status },
        openclawCustomFields: { ok: fieldsResult.ok, status: fieldsResult.status },
        openclawGarageTrucks: { ok: garageTasksResult.ok, status: garageTasksResult.status },
        openclawOffers: { ok: offerTasksResult.ok, status: offerTasksResult.status },
      },
      has_openclaw: hasOpenClaw,
      hasOpenClaw,
      garageTrucks: garageTasks,
      knowledge,
      offers,
      revenue: {
        sourceTag: readString(revenue, ["source_tag"]),
        currentMrrEur: readNumber(revenue, ["mrr_eur", "mrr_active_eur"]),
        currentArrEur: readNumber(revenue, ["arr_eur"]),
        activeVip: readNumber(revenue, ["active_vip"]),
        pastDueCount: readNumber(revenue, ["past_due_count"]),
        pastDueEur: readNumber(revenue, ["past_due_eur", "past_due_eur_total"]),
        ftdCumul: readNumber(revenue, ["ftd_cumul"]),
        brokersLifetimeUsd: readNumber(revenue, ["brokers_commission_lifetime_usd"]),
        clientsActive: readNumber(revenue, ["clients_active"]),
        brokers: {
          fxcess: toRecord(brokers.fxcess),
          ironfx: toRecord(brokers.ironfx),
          libertex: toRecord(brokers.libertex),
          raisefx: toRecord(brokers.raisefx),
        },
      },
      centralBrain: {
        housesCount: readNumber(housesPayload, ["houses_count", "count"]) ?? houses.length,
        houses: houses.slice(0, 20).map((house) => {
          const entry = toRecord(house);
          return {
            key: readString(entry, ["key", "id", "name"]) ?? "UNKNOWN",
            title: readString(entry, ["title", "label", "name"]) ?? "UNKNOWN",
            status: readString(entry, ["status"]) ?? "UNKNOWN",
          };
        }),
      },
      publisher: {
        ok: publisherResult.ok,
        status: readString(publisher, ["status"]) ?? (publisherResult.ok ? "LIVE_HTTP" : "UNKNOWN"),
        service: readString(publisher, ["service"]) ?? "CofiaPublisher",
        outputDirCount: readNumber(publisher, ["output_dir_count", "renders_count", "count"]),
      },
      services: [
        { id: "ack-server", label: "ack-server :8443", ok: ackResult.ok, status: ackResult.status },
        { id: "rtk-llm-proxy", label: "rtk-llm-proxy :11435", ok: rtkResult.ok, status: rtkResult.status },
      ],
      openclaw: {
        sourceTag: "COFIATRADING_WORLD_CONTROL_LIVING_OBJECTS_20260525",
        boards: boards.map((board) => ({
          id: readString(board, ["id"]) ?? "UNKNOWN",
          name: readString(board, ["name"]) ?? "UNKNOWN",
          slug: readString(board, ["slug"]) ?? "UNKNOWN",
        })),
        agents: agents.map((agent) => {
          const profile = toRecord(agent.identity_profile);
          return {
            id: readString(agent, ["id"]) ?? "UNKNOWN",
            name: readString(agent, ["name"]) ?? "UNKNOWN",
            status: readString(agent, ["status"]) ?? "UNKNOWN",
            boardId: readString(agent, ["board_id"]),
            role: readString(profile, ["role"]) ?? "UNKNOWN",
            authorizedTrucks: readString(profile, ["authorized_trucks"]) ?? "UNKNOWN",
            dailyOutput: readString(profile, ["daily_output"]) ?? "UNKNOWN",
            forbiddenActions: readString(profile, ["forbidden_actions"]) ?? "UNKNOWN",
          };
        }),
        customFields: customFields.map((field) => ({
          key: readString(field, ["field_key"]) ?? "UNKNOWN",
          label: readString(field, ["label"]) ?? "UNKNOWN",
          type: readString(field, ["field_type"]) ?? "UNKNOWN",
        })),
        garageTrucks: garageTasks,
        approvals: proofApprovals.map((approval) => ({
          id: readString(approval, ["id"]) ?? "UNKNOWN",
          actionType: readString(approval, ["action_type"]) ?? "UNKNOWN",
          status: readString(approval, ["status"]) ?? "UNKNOWN",
          taskTitles: Array.isArray(approval.task_titles) ? approval.task_titles : [],
        })),
        buildings: buildingSummaries,
      },
      writeBlocked: true,
      piiBlocked: true,
      dangerousActions: ["SEND", "PUBLISH", "DEPLOY", "STRIPE_WRITE", "OLD_CITY_PATCH", "MAIN_MERGE"],
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
