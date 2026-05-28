import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Status = "GREEN" | "LIVE" | "AMBER" | "UNKNOWN" | "PAUSED" | "QUARANTINE" | "LOCKED";

type SnapshotTruck = {
  id?: string;
  title?: string;
  truckName?: string | null;
  truckStatus?: string;
  driverAgent?: string;
  destinationBoard?: string;
  currentJob?: string;
  route?: string;
  lastProof?: string;
  lastRunAt?: string | null;
  writeLock?: boolean;
};

type SnapshotAgent = {
  id?: string;
  name?: string;
  status?: string;
  boardId?: string | null;
  role?: string;
};

type SnapshotBuilding = {
  id?: string;
  name?: string;
  slug?: string;
  activeTasks?: number;
  trucks?: string[];
  proof?: string;
};

type SnapshotPayload = {
  ok?: boolean;
  fetchedAt?: string;
  sourceTag?: string;
  revenue?: {
    currentMrrEur?: number | null;
    currentArrEur?: number | null;
    activeVip?: number | null;
    pastDueEur?: number | null;
    clientsActive?: number | null;
    brokersLifetimeUsd?: number | null;
  };
  centralBrain?: {
    housesCount?: number | null;
    houses?: Array<{ key?: string; title?: string; status?: string }>;
  };
  publisher?: {
    ok?: boolean;
    status?: string;
    outputDirCount?: number | null;
  };
  publication?: {
    summary?: {
      queueTotal?: number;
      greenOrLiveProofs?: number;
      rendersReady?: number | null;
    };
  };
  openclaw?: {
    garageTrucks?: SnapshotTruck[];
    agents?: SnapshotAgent[];
    buildings?: SnapshotBuilding[];
  };
};

const SNAPSHOT_URL =
  process.env.COF_WORLD_CONTROL_SNAPSHOT_URL ??
  "http://127.0.0.1:3000/api/cofiatrading-world-control/snapshot";

const routeCoordinates = [
  { fromX: 214, fromY: 444, toX: 478, toY: 282, label: "Asset Factory → Castle" },
  { fromX: 352, fromY: 500, toX: 612, toY: 318, label: "Publisher → Revenue" },
  { fromX: 742, fromY: 436, toX: 514, toY: 260, label: "Offer Factory → Proof" },
  { fromX: 190, fromY: 398, toX: 704, toY: 448, label: "Support → Investor" },
  { fromX: 500, fromY: 548, toX: 500, toY: 246, label: "Command spine" },
  { fromX: 808, fromY: 510, toX: 422, toY: 330, label: "Acquisition → Revenue" },
];

const normalizeStatus = (value: string | undefined | null): Status => {
  const upper = (value ?? "UNKNOWN").toUpperCase();
  if (upper === "GREEN" || upper === "LIVE" || upper === "AMBER" || upper === "PAUSED" || upper === "QUARANTINE" || upper === "LOCKED") {
    return upper;
  }
  if (upper.includes("LOCK")) return "LOCKED";
  if (upper.includes("PAUSE")) return "PAUSED";
  if (upper.includes("QUARANT")) return "QUARANTINE";
  if (upper.includes("AMBER") || upper.includes("DEGRADED")) return "AMBER";
  if (upper.includes("GREEN") || upper.includes("LIVE")) return "LIVE";
  return "UNKNOWN";
};

const statusWeight = (status: Status) => {
  if (status === "GREEN" || status === "LIVE") return 1;
  if (status === "AMBER") return 0.65;
  if (status === "PAUSED" || status === "QUARANTINE") return 0.35;
  if (status === "LOCKED") return 0.2;
  return 0.1;
};

const readSnapshot = async (): Promise<SnapshotPayload> => {
  const response = await fetch(SNAPSHOT_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) {
    throw new Error(`snapshot_http_${response.status}`);
  }
  return (await response.json()) as SnapshotPayload;
};

export async function GET() {
  const snapshot = await readSnapshot();
  const trucks = (snapshot.openclaw?.garageTrucks ?? []).slice(0, 24).map((truck, index) => {
    const status = normalizeStatus(truck.truckStatus);
    const route = routeCoordinates[index % routeCoordinates.length];
    const offset = Math.floor(index / routeCoordinates.length) * 7;
    return {
      id: truck.id ?? `truck-${index}`,
      name: truck.truckName ?? truck.title ?? `Truck ${index + 1}`,
      status,
      owner: truck.driverAgent ?? "UNKNOWN",
      source: truck.destinationBoard ?? "OpenClaw garage-trucks",
      currentJob: truck.currentJob ?? "UNKNOWN",
      proof: truck.lastProof ?? "UNKNOWN",
      lastRunAt: truck.lastRunAt ?? null,
      writeLocked: truck.writeLock ?? true,
      routeLabel: truck.route ?? route.label,
      movement: {
        fromX: route.fromX + offset,
        fromY: route.fromY - offset,
        toX: route.toX - offset,
        toY: route.toY + offset,
        durationSec: Math.max(7, 18 - statusWeight(status) * 8 + (index % 5)),
        delaySec: (index % 8) * -0.55,
      },
    };
  });

  const agents = (snapshot.openclaw?.agents ?? []).slice(0, 38).map((agent, index) => ({
    id: agent.id ?? `agent-${index}`,
    name: agent.name ?? "UNKNOWN",
    status: normalizeStatus(agent.status),
    role: agent.role ?? "UNKNOWN",
    boardId: agent.boardId ?? null,
    roomIndex: index % Math.max(1, snapshot.centralBrain?.housesCount ?? 15),
  }));

  const buildings = (snapshot.openclaw?.buildings ?? []).slice(0, 33).map((building, index) => ({
    id: building.id ?? `building-${index}`,
    name: building.name ?? "UNKNOWN",
    slug: building.slug ?? "UNKNOWN",
    activeTasks: building.activeTasks ?? 0,
    trucks: building.trucks ?? [],
    proof: building.proof ?? "UNKNOWN",
    status: (building.activeTasks ?? 0) > 0 || (building.trucks?.length ?? 0) > 0 ? "LIVE" : "AMBER",
  }));

  const now = new Date().toISOString();
  const events = [
    {
      id: "snapshot-heartbeat",
      kind: "heartbeat",
      status: "LIVE",
      label: "World snapshot refreshed",
      source: "snapshot",
      proof: snapshot.sourceTag ?? "snapshot source tag missing",
      ts: now,
    },
    {
      id: "revenue-command",
      kind: "revenue",
      status: snapshot.revenue?.currentMrrEur ? "LIVE" : "UNKNOWN",
      label: `Revenue ${snapshot.revenue?.currentMrrEur ?? "UNKNOWN"} MRR`,
      source: "NY backend Stripe + Iron summary",
      proof: `ARR=${snapshot.revenue?.currentArrEur ?? "UNKNOWN"}; clients=${snapshot.revenue?.clientsActive ?? "UNKNOWN"}`,
      ts: now,
    },
    {
      id: "publisher",
      kind: "publisher",
      status: snapshot.publisher?.ok ? "LIVE" : "LOCKED",
      label: `CofiaPublisher ${snapshot.publisher?.outputDirCount ?? "UNKNOWN"} renders`,
      source: "CofiaPublisher :8540",
      proof: snapshot.publisher?.status ?? "UNKNOWN",
      ts: now,
    },
    {
      id: "openclaw-trucks",
      kind: "trucks",
      status: trucks.length > 0 ? "LIVE" : "UNKNOWN",
      label: `${trucks.length} trucks rendered from OpenClaw records`,
      source: "OpenClaw garage-trucks",
      proof: `${snapshot.openclaw?.garageTrucks?.length ?? 0} total garage truck records in snapshot`,
      ts: now,
    },
  ];

  return NextResponse.json({
    ok: true,
    source_tag: "NY_LIVING_WORLD_STATE_V1_20260527T1507Z",
    doctrine_source_tag: "NY_LIVING_WORLD_TATBIQ_SYNC_20260527T1507Z",
    snapshot_source_tag: snapshot.sourceTag ?? "UNKNOWN",
    runtime_ts: now,
    mode: "LIVING_WORLD_DERIVED_FROM_REAL_SNAPSHOT",
    honesty: "Not an event bus yet: this is a living world-state adapter over proven New York snapshot data.",
    summary: {
      trucks: trucks.length,
      agents: agents.length,
      buildings: buildings.length,
      houses: snapshot.centralBrain?.housesCount ?? null,
      mrr_eur: snapshot.revenue?.currentMrrEur ?? null,
      arr_eur: snapshot.revenue?.currentArrEur ?? null,
      publication_queue: snapshot.publication?.summary?.queueTotal ?? null,
      renders_ready: snapshot.publication?.summary?.rendersReady ?? snapshot.publisher?.outputDirCount ?? null,
    },
    trucks,
    agents,
    buildings,
    events,
    next_engine_steps: [
      "Persist events in New York Proof Ledger instead of deriving them only from snapshot.",
      "Convert mission-composer POST into event-producing task lifecycle.",
      "Attach Central Brain room commands to world-state events.",
      "Only then retire Old City dependencies function by function.",
    ],
  });
}
