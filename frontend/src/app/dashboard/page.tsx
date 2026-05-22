"use client";

export const dynamic = "force-dynamic";

import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { SignedIn, SignedOut, useAuth } from "@/auth/clerk";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Eye,
  Info,
  LayoutGrid,
  RefreshCw,
  Shield,
  Timer,
  X,
} from "lucide-react";

import seasonalWindows from "@/config/seasonal-windows.json";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Markdown } from "@/components/atoms/Markdown";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { CopyableId } from "@/components/ui/copyable-id";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, customFetch } from "@/api/mutator";
import {
  type dashboardMetricsApiV1MetricsDashboardGetResponse,
  useDashboardMetricsApiV1MetricsDashboardGet,
} from "@/api/generated/metrics/metrics";
import {
  getGatewaySessionApiV1GatewaysSessionsSessionIdGet,
  gatewaysStatusApiV1GatewaysStatusGet,
} from "@/api/generated/gateways/gateways";
import type { GatewaysStatusResponse } from "@/api/generated/model/gatewaysStatusResponse";
import {
  type listAgentsApiV1AgentsGetResponse,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type listActivityApiV1ActivityGetResponse,
  useListActivityApiV1ActivityGet,
} from "@/api/generated/activity/activity";
import type { ActivityEventRead } from "@/api/generated/model";
import {
  formatRelativeTimestamp,
  formatTimestamp,
  getPendingSinceTone,
  parseTimestamp,
} from "@/lib/formatters";
import { usePageActive } from "@/hooks/usePageActive";
import { cn } from "@/lib/utils";
import {
  type SessionInspectDetails,
  buildSessionInspectDetails,
} from "./session-inspect";
import { buildSessionUsageSummary } from "./session-usage";

type SessionSummary = {
  key: string;
  sessionId: string;
  boardId: string | null;
  boardName: string | null;
  title: string;
  sourceLabel: string;
  subtitle: string;
  usageLabel: string;
  usagePercent: number | null;
  usageToneClassName: string;
  lastSeenAt: string | null;
  provider: string | null;
  model: string | null;
  health: "active" | "idle" | "error";
  isMain: boolean;
};

type SummaryRow = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
};

type GatewayTarget = {
  gatewayId: string;
  boardId: string;
  boardName: string;
};

type GatewaySnapshot = GatewayTarget & {
  connected: boolean;
  gatewayUrl: string | null;
  sessionsCount: number;
  sessions: unknown[];
  mainSession: unknown | null;
  mainSessionError: string | null;
  error: string | null;
  requestError: string | null;
};

const DASH = "—";
const DASHBOARD_RANGE = "7d";
const DASHBOARD_RANGE_DAYS = 7;
const DASHBOARD_RANGE_LABEL = "7 days";
const DASHBOARD_REFETCH_INTERVAL_MS = 15_000;
const DASHBOARD_STALE_AFTER_MS = 30_000;

const numberFormatter = new Intl.NumberFormat("en-US");
const SESSION_ID_KEYS = ["key", "id", "session_key", "sessionKey", "sessionId"];
const SESSION_IDLE_MS = 5 * 60 * 1000;

const PROVIDER_BADGE_CLASS_BY_PROVIDER: Record<string, string> = {
  anthropic: "bg-amber-100 text-amber-700",
  google: "bg-blue-100 text-blue-700",
  minimax: "bg-purple-100 text-purple-700",
  openai: "bg-emerald-100 text-emerald-700",
  "openai-codex": "bg-emerald-100 text-emerald-700",
  openrouter: "bg-slate-100 text-slate-700",
};

const providerFromModel = (model: string | null): string | null => {
  if (!model) return null;
  const [prefix] = model.split("/");
  if (!prefix) return null;
  if (prefix === "openai-codex") return "openai";
  if (prefix === "minimax-portal") return "minimax";
  return prefix;
};

const providerBadgeClass = (provider: string | null): string =>
  provider
    ? PROVIDER_BADGE_CLASS_BY_PROVIDER[provider.toLowerCase()] ??
      "bg-slate-100 text-slate-700"
    : "bg-slate-100 text-slate-700";

const providerLabel = (provider: string | null): string =>
  provider ? provider.replace(/[-_]/g, " ") : "Provider";

const DashboardPanelSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-2" aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => (
      <Skeleton key={index} className="h-[76px] rounded-lg border border-slate-200" />
    ))}
  </div>
);

const modelLabel = (model: string | null): string | null => {
  if (!model) return null;
  return model.split("/").pop() ?? model;
};

const sessionOptionId = (sessionKey: string): string =>
  `session-option-${sessionKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const normalizeBoardId = (boardId: string | null | undefined): string | null => {
  if (typeof boardId !== "string") return null;
  const trimmed = boardId.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const deriveSessionHealth = (
  status: string | null,
  lastSeenAt: string | null,
): SessionSummary["health"] => {
  const normalized = (status ?? "").trim().toLowerCase();
  if (
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("fail")
  ) {
    return "error";
  }
  if (normalized.includes("idle")) return "idle";
  const lastSeen = lastSeenAt ? parseTimestamp(lastSeenAt) : null;
  if (lastSeen && Date.now() - lastSeen.getTime() > SESSION_IDLE_MS) return "idle";
  return "active";
};

const sessionHealthDotClass: Record<SessionSummary["health"], string> = {
  active: "bg-emerald-500",
  idle: "bg-amber-500",
  error: "bg-rose-500",
};

const pendingSinceBadgeClass = (createdAt?: string | null) => {
  const tone = getPendingSinceTone(createdAt);
  if (tone === "danger") return "bg-rose-100 text-rose-700";
  if (tone === "warning") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
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

const readStringFromRecords = (
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): string | null => {
  for (const record of records) {
    const value = readString(record, keys);
    if (value) return value;
  }
  return null;
};

const readNumberFromRecords = (
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): number | null => {
  for (const record of records) {
    const value = readNumber(record, keys);
    if (value !== null) return value;
  }
  return null;
};

const normalizeEpochMs = (value: number): number => {
  if (value >= 1_000_000_000_000) return value;
  if (value >= 1_000_000_000) return value * 1000;
  return value;
};

const readTimestamp = (
  record: Record<string, unknown> | null,
  keys: string[],
): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const date = new Date(normalizeEpochMs(value));
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const numeric = Number.parseFloat(trimmed);
      if (Number.isFinite(numeric)) {
        const date = new Date(normalizeEpochMs(numeric));
        if (!Number.isNaN(date.getTime())) return date.toISOString();
      }
      const parsed = parseTimestamp(trimmed);
      if (parsed) return parsed.toISOString();
    }
  }
  return null;
};

const readTimestampFromRecords = (
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): string | null => {
  for (const record of records) {
    const value = readTimestamp(record, keys);
    if (value) return value;
  }
  return null;
};

const sessionIdentifiers = (record: Record<string, unknown> | null): string[] => {
  if (!record) return [];
  const ids = SESSION_ID_KEYS.map((key) => readString(record, [key])).filter(Boolean) as string[];
  return [...new Set(ids)];
};

const sharesSessionIdentity = (left: string[], right: string[]): boolean =>
  left.some((value) => right.includes(value));

const formatCount = (value: number): string =>
  Number.isFinite(value) ? numberFormatter.format(Math.max(0, Math.round(value))) : "0";

const formatPercent = (value: number): string =>
  Number.isFinite(value) ? `${value.toFixed(1)}%` : DASH;

const formatPerDay = (total: number, days: number): string => {
  if (!Number.isFinite(total) || !Number.isFinite(days) || days <= 0) return DASH;
  return `${(total / days).toFixed(1)}/day`;
};

const toSessionSummaries = (
  sessions: unknown[] | null | undefined,
  mainSession: unknown,
): SessionSummary[] => {
  const sessionRecords = (sessions ?? []).map(toRecord).filter(Boolean) as Array<
    Record<string, unknown>
  >;
  const mainRecord = toRecord(mainSession);
  const mainIdentifiers = sessionIdentifiers(mainRecord);

  if (mainRecord && mainIdentifiers.length > 0) {
    const exists = sessionRecords.some(
      (entry) => sharesSessionIdentity(sessionIdentifiers(entry), mainIdentifiers),
    );
    if (!exists) sessionRecords.unshift(mainRecord);
  }

  const uniqueRecords: Record<string, unknown>[] = [];
  const seenIdentifiers = new Set<string>();

  for (const entry of sessionRecords) {
    const identifiers = sessionIdentifiers(entry);
    if (identifiers.length > 0 && identifiers.some((value) => seenIdentifiers.has(value))) {
      continue;
    }
    uniqueRecords.push(entry);
    identifiers.forEach((value) => seenIdentifiers.add(value));
  }

  return uniqueRecords.map((entry, index) => {
    const usageRecord = toRecord(entry.usage);
    const statsRecord = toRecord(entry.stats);
    const metricsRecord = toRecord(entry.metrics);
    const originRecord = toRecord(entry.origin);
    const candidateRecords = [entry, usageRecord, statsRecord, metricsRecord];

    const identifiers = sessionIdentifiers(entry);
    const key =
      readString(entry, ["key", "session_key", "sessionKey", "id", "sessionId"]) ??
      `session-${index}`;
    const label = readString(entry, ["label", "name", "title"]) ?? key;
    const channel = readStringFromRecords([entry, originRecord], [
      "channel",
      "source",
      "kind",
      "chatType",
    ]);
    const model = readString(entry, ["model", "model_name", "provider", "engine"]);
    const modelProvider =
      readString(entry, ["modelProvider", "model_provider", "provider"]) ??
      providerFromModel(model);
    const sessionStatus = readString(entry, [
      "status",
      "state",
      "health",
      "lifecycle",
      "phase",
    ]);
    const lastSeenAt = readTimestampFromRecords(candidateRecords, [
      "updated_at",
      "updatedAt",
      "last_updated_at",
      "lastUpdatedAt",
      "last_seen_at",
      "lastSeen",
      "last_seen",
      "last_active_at",
      "lastActiveAt",
      "lastActivityAt",
      "activityAt",
      "created_at",
      "createdAt",
    ]);

    const usedTokens = readNumberFromRecords(candidateRecords, [
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
    ]);
    const maxTokens = readNumberFromRecords(candidateRecords, [
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
    ]);

    const pctFromPayload = readNumberFromRecords(candidateRecords, [
      "pct",
      "percent",
      "ratio_pct",
      "ratioPct",
      "token_pct",
      "usage_pct",
      "percentUsed",
      "contextPercent",
    ]);
    const usageSummary = buildSessionUsageSummary(usedTokens, maxTokens, pctFromPayload);

    const subtitleBits = [channel, model].filter(Boolean) as string[];
    const subtitle = subtitleBits.length > 0 ? subtitleBits.join(" · ") : "Session";
    const modelWithProvider =
      modelProvider && model && modelProvider !== model ? `${model} · ${modelProvider}` : model;
    const subtitleWithProvider = [channel, modelWithProvider].filter(Boolean).join(" · ");

    return {
      key,
      sessionId: key,
      boardId: null,
      boardName: null,
      title: label,
      sourceLabel: "",
      subtitle: subtitleWithProvider || subtitle,
      usageLabel: usageSummary.label,
      usagePercent: usageSummary.percent,
      usageToneClassName: usageSummary.toneClassName,
      lastSeenAt,
      provider: modelProvider,
      model,
      health: deriveSessionHealth(sessionStatus, lastSeenAt),
      isMain:
        mainIdentifiers.length > 0 &&
        sharesSessionIdentity(identifiers, mainIdentifiers),
    };
  });
};

function TopMetricCard({
  title,
  value,
  secondary,
  infoText,
  icon,
  accent,
}: {
  title: string;
  value: string;
  secondary?: string;
  infoText?: string;
  icon: React.ReactNode;
  accent: "blue" | "green" | "violet" | "emerald";
}) {
  const iconTone =
    accent === "blue"
      ? "bg-blue-50 text-blue-600"
      : accent === "green"
        ? "bg-emerald-50 text-emerald-600"
        : accent === "violet"
          ? "bg-violet-50 text-violet-600"
          : "bg-green-50 text-green-600";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {title}
            </p>
            {infoText ? (
              <span
                className="inline-flex text-slate-400"
                title={infoText}
                aria-label={infoText}
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <p className="font-heading text-4xl font-bold text-slate-900">{value}</p>
            {secondary ? (
              <p className="pb-1 text-xs text-slate-500">{secondary}</p>
            ) : null}
          </div>
        </div>
        <div className={`rounded-lg p-2 ${iconTone}`}>
          {icon}
        </div>
      </div>
    </section>
  );
}

function InfoBlock({
  title,
  badge,
  infoText,
  rows,
}: {
  title: string;
  badge?: { text: string; tone: "online" | "offline" | "neutral" };
  infoText?: string;
  rows: SummaryRow[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {infoText ? (
            <span
              className="inline-flex text-slate-400"
              title={infoText}
              aria-label={infoText}
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
        {badge ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              badge.tone === "online"
                ? "bg-emerald-100 text-emerald-700"
                : badge.tone === "offline"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate-200 text-slate-700"
            }`}
          >
            {badge.text}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`} className="flex items-start justify-between gap-3 px-3 py-2">
            <span className="min-w-0 text-sm text-slate-500">{row.label}</span>
            <span
              className={`max-w-[65%] break-words text-right text-sm font-medium leading-5 ${
                row.tone === "success"
                  ? "text-emerald-700"
                  : row.tone === "warning"
                    ? "text-amber-700"
                    : row.tone === "danger"
                      ? "text-rose-700"
                      : "text-slate-800"
              }`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── SeasonalBanner ──────────────────────────────────────────────────────────

interface SeasonalWindow {
  id?: string
  product: string
  deadline?: string
  bannerText?: string
  urgency?: string
}

function SeasonalBanner() {
  const [now] = useState(() => Date.now())
  const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {}
    const initial: Record<string, boolean> = {}
    for (const w of seasonalWindows as SeasonalWindow[]) {
      if (!w.id || !w.deadline) continue
      const key = `mc:shimmer-banner-dismissed-${w.id}`
      if (localStorage.getItem(key) === "1") initial[w.id] = true
    }
    return initial
  })

  const activeWindows = (seasonalWindows as SeasonalWindow[]).filter((w) => {
    if (!w.id || !w.deadline) return false
    const deadlineMs = new Date(w.deadline).getTime()
    return deadlineMs > now && deadlineMs - now < FOURTEEN_DAYS && !dismissed[w.id]
  })

  if (activeWindows.length === 0) return null

  return (
    <div className="mb-4 space-y-2">
      {activeWindows.map((w) => {
        const deadlineMs = new Date(w.deadline!).getTime()
        const daysLeft = Math.ceil((deadlineMs - now) / (24 * 60 * 60 * 1000))
        const text = (w.bannerText ?? `⚡ ${w.product} 窗口即将关闭 — 还有 {N} 天`).replace("{N}", String(daysLeft))
        return (
          <div
            key={w.id}
            className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span className="flex-1">{text}</span>
            <button
              aria-label="dismiss"
              onClick={() => {
                localStorage.setItem(`mc:shimmer-banner-dismissed-${w.id}`, "1")
                setDismissed((prev) => ({ ...prev, [w.id!]: true }))
              }}
              className="shrink-0 rounded p-0.5 hover:bg-amber-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const isPageActive = usePageActive();
  const [sessionActionMessage, setSessionActionMessage] = useState<string | null>(null);
  const [inspectedSession, setInspectedSession] = useState<SessionInspectDetails | null>(null);
  const [activeSessionIndex, setActiveSessionIndex] = useState(-1);
  const [killSessionTarget, setKillSessionTarget] = useState<SessionSummary | null>(null);
  const [killSessionError, setKillSessionError] = useState<string | null>(null);
  const [isKillingSession, setIsKillingSession] = useState(false);

  const boardsQuery = useListBoardsApiV1BoardsGet<listBoardsApiV1BoardsGetResponse, ApiError>(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 30_000,
        refetchOnMount: "always",
      },
    },
  );

  const agentsQuery = useListAgentsApiV1AgentsGet<listAgentsApiV1AgentsGetResponse, ApiError>(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 15_000,
        refetchOnMount: "always",
      },
    },
  );

  const metricsQuery = useDashboardMetricsApiV1MetricsDashboardGet<
    dashboardMetricsApiV1MetricsDashboardGetResponse,
    ApiError
  >(
    {
      range_key: DASHBOARD_RANGE,
    },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: isPageActive ? DASHBOARD_REFETCH_INTERVAL_MS : false,
        refetchOnMount: "always",
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      },
    },
  );

  const activityQuery = useListActivityApiV1ActivityGet<listActivityApiV1ActivityGetResponse, ApiError>(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 15_000,
        refetchOnMount: "always",
      },
    },
  );

  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? [...(boardsQuery.data.data.items ?? [])].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [boardsQuery.data],
  );

  const agents = useMemo(
    () =>
      agentsQuery.data?.status === 200
        ? [...(agentsQuery.data.data.items ?? [])].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [agentsQuery.data],
  );

  const metrics = metricsQuery.data?.status === 200 ? metricsQuery.data.data : null;

  const effectiveUpdatedAt = metricsQuery.dataUpdatedAt;
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!metricsQuery.isSuccess || !effectiveUpdatedAt) return;
    setLastUpdated(effectiveUpdatedAt);
  }, [effectiveUpdatedAt, metricsQuery.isSuccess]);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const lastUpdatedLabel =
    lastUpdated === null
      ? DASH
      : new Date(lastUpdated).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
  const isMetricsStale =
    !effectiveUpdatedAt || nowMs - effectiveUpdatedAt >= DASHBOARD_STALE_AFTER_MS;
  const metricsStatus = metricsQuery.isError
    ? {
        dot: "✕",
        label: "Disconnected",
        className: "border-rose-200 bg-rose-50 text-rose-700",
        dotClassName: "text-rose-600",
        dotStyle: { animation: "none" as const },
      }
    : isMetricsStale
      ? {
          dot: "○",
          label: "Stale (30s+)",
          className: "border-amber-200 bg-amber-50 text-amber-700",
          dotClassName: "text-amber-600",
          dotStyle: { animation: "none" as const },
        }
      : {
          dot: "●",
          label: "Live",
          className: "border-emerald-200 bg-emerald-50 text-emerald-700",
          dotClassName: "animate-pulse text-emerald-500",
          dotStyle: undefined,
        };

  const onlineAgents = useMemo(
    () => agents.filter((agent) => (agent.status ?? "").toLowerCase() === "online").length,
    [agents],
  );
  const gatewayTargets = useMemo<GatewayTarget[]>(() => {
    const byGateway = new Map<string, GatewayTarget>();
    for (const board of boards) {
      const gatewayId = board.gateway_id;
      if (!gatewayId) continue;
      if (byGateway.has(gatewayId)) continue;
      byGateway.set(gatewayId, {
        gatewayId,
        boardId: board.id,
        boardName: board.name,
      });
    }
    return [...byGateway.values()].sort((a, b) => a.boardName.localeCompare(b.boardName));
  }, [boards]);
  const hasConfiguredGateways = gatewayTargets.length > 0;

  const gatewayStatusesQuery = useQuery<GatewaySnapshot[], ApiError>({
    queryKey: [
      "dashboard",
      "gateway-statuses",
      gatewayTargets.map((target) => `${target.gatewayId}:${target.boardId}`),
    ],
    enabled: Boolean(isSignedIn && hasConfiguredGateways),
    refetchInterval: 15_000,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      return Promise.all(
        gatewayTargets.map(async (target): Promise<GatewaySnapshot> => {
          try {
            const response = await gatewaysStatusApiV1GatewaysStatusGet(
              { board_id: target.boardId },
              { signal },
            );
            if (response.status !== 200) {
              return {
                ...target,
                connected: false,
                gatewayUrl: null,
                sessionsCount: 0,
                sessions: [],
                mainSession: null,
                mainSessionError: null,
                error: null,
                requestError: `Gateway status request failed (${response.status})`,
              };
            }
            const payload: GatewaysStatusResponse = response.data;
            return {
              ...target,
              connected: Boolean(payload.connected),
              gatewayUrl: payload.gateway_url ?? null,
              sessionsCount: Number(payload.sessions_count ?? 0),
              sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
              mainSession: payload.main_session ?? null,
              mainSessionError: payload.main_session_error ?? null,
              error: payload.error ?? null,
              requestError: null,
            };
          } catch (error) {
            if (signal.aborted) throw error;
            return {
              ...target,
              connected: false,
              gatewayUrl: null,
              sessionsCount: 0,
              sessions: [],
              mainSession: null,
              mainSessionError: null,
              error: null,
              requestError:
                error instanceof Error ? error.message : "Gateway status request failed.",
            };
          }
        }),
      );
    },
  });

  const gatewaySnapshots = useMemo(
    () => gatewayStatusesQuery.data ?? [],
    [gatewayStatusesQuery.data],
  );
  const sessionSummaries = useMemo(
    () =>
      gatewaySnapshots.flatMap((snapshot) => {
        if (snapshot.requestError) return [];
        const sourceLabel = snapshot.gatewayUrl || snapshot.boardName;
        return toSessionSummaries(snapshot.sessions, snapshot.mainSession).map((session) => ({
          ...session,
          key: `${snapshot.gatewayId}:${session.key}`,
          boardId: snapshot.boardId,
          boardName: snapshot.boardName,
          sourceLabel,
        }));
      }),
    [gatewaySnapshots],
  );

  const activityEvents = useMemo(
    () =>
      activityQuery.data?.status === 200
        ? [...(activityQuery.data.data.items ?? [])]
        : [],
    [activityQuery.data],
  );

  const orderedActivityEvents = useMemo(
    () =>
      [...activityEvents].sort((a, b) => {
        const left = parseTimestamp(a.created_at)?.getTime() ?? 0;
        const right = parseTimestamp(b.created_at)?.getTime() ?? 0;
        return right - left;
      }),
    [activityEvents],
  );

  const recentLogs = orderedActivityEvents.slice(0, 8);

  const latestThroughputPoint =
    metrics?.throughput.primary.points?.[metrics.throughput.primary.points.length - 1] ?? null;
  const throughputTotal = (metrics?.throughput.primary.points ?? []).reduce(
    (sum, point) => sum + Number(point.value ?? 0),
    0,
  );
  const completionDaysCount = (metrics?.throughput.primary.points ?? []).reduce(
    (sum, point) => sum + (Number(point.value ?? 0) > 0 ? 1 : 0),
    0,
  );

  const inboxTasksMetric = metrics?.kpis.inbox_tasks ?? 0;
  const inProgressTasksMetric = metrics?.kpis.in_progress_tasks ?? 0;
  const reviewTasksMetric = metrics?.kpis.review_tasks ?? 0;
  const doneTasksMetric = metrics?.kpis.done_tasks ?? 0;

  const activeAgentsMetric = onlineAgents;
  const tasksTotal = inboxTasksMetric + inProgressTasksMetric + reviewTasksMetric + doneTasksMetric;
  const tasksInProgressMetric = metrics?.kpis.tasks_in_progress ?? inProgressTasksMetric;
  const errorRateMetric = Number(metrics?.kpis.error_rate_pct ?? 0);
  const reviewBacklogRatio =
    inProgressTasksMetric > 0 ? reviewTasksMetric / inProgressTasksMetric : null;

  const gatewayConnectedCount = gatewaySnapshots.filter(
    (snapshot) => !snapshot.requestError && snapshot.connected,
  ).length;
  const gatewayDisconnectedCount = gatewaySnapshots.filter(
    (snapshot) => !snapshot.requestError && !snapshot.connected,
  ).length;
  const gatewayUnavailableCount = gatewaySnapshots.filter(
    (snapshot) => Boolean(snapshot.requestError),
  ).length;
  const gatewayHealthErrorCount = gatewaySnapshots.filter(
    (snapshot) => Boolean(snapshot.error || snapshot.mainSessionError),
  ).length;

  const countedSessions = gatewaySnapshots.reduce(
    (sum, snapshot) => sum + Math.max(0, snapshot.sessionsCount),
    0,
  );
  const activeSessions = Math.max(countedSessions, sessionSummaries.length);

  useEffect(() => {
    if (sessionSummaries.length === 0) {
      setActiveSessionIndex(-1);
      return;
    }
    setActiveSessionIndex((currentIndex) => {
      if (currentIndex < 0) return 0;
      return Math.min(currentIndex, sessionSummaries.length - 1);
    });
  }, [sessionSummaries]);

  const gatewayStatusLabel = !hasConfiguredGateways
    ? "Not configured"
    : gatewayStatusesQuery.isLoading
      ? "Checking"
      : gatewayConnectedCount === gatewayTargets.length
        ? "All connected"
        : gatewayConnectedCount > 0
          ? "Partially connected"
          : gatewayUnavailableCount === gatewayTargets.length
            ? "Unavailable"
            : "Disconnected";
  const gatewayBadgeTone: "online" | "offline" | "neutral" =
    gatewayStatusLabel === "All connected"
      ? "online"
      : gatewayStatusLabel === "Partially connected" ||
          gatewayStatusLabel === "Disconnected" ||
          gatewayStatusLabel === "Unavailable"
        ? "offline"
        : "neutral";
  const gatewayStatusTone: SummaryRow["tone"] =
    gatewayStatusLabel === "All connected"
      ? "success"
      : gatewayStatusLabel === "Checking" || gatewayStatusLabel === "Not configured"
        ? "default"
        : gatewayStatusLabel === "Partially connected" || gatewayStatusLabel === "Disconnected"
          ? "warning"
          : "danger";

  const workloadRows: SummaryRow[] = [
    {
      label: "Total work items",
      value: formatCount(tasksTotal),
    },
    {
      label: "Inbox",
      value: formatCount(inboxTasksMetric),
    },
    {
      label: "In progress",
      value: formatCount(inProgressTasksMetric),
      tone: inProgressTasksMetric > 0 ? "warning" : "default",
    },
    {
      label: "In review",
      value: formatCount(reviewTasksMetric),
    },
    {
      label: "Completed",
      value: formatCount(doneTasksMetric),
      tone: doneTasksMetric > 0 ? "success" : "default",
    },
  ];

  const throughputRows: SummaryRow[] = [
    {
      label: "Completed tasks",
      value: formatCount(throughputTotal),
    },
    { label: "Average throughput", value: formatPerDay(throughputTotal, DASHBOARD_RANGE_DAYS) },
    {
      label: "Error rate",
      value: formatPercent(errorRateMetric),
      tone: errorRateMetric > 0 ? "warning" : "success",
    },
    {
      label: "Completion consistency",
      value: `${formatCount(completionDaysCount)} active days`,
      tone: completionDaysCount >= Math.ceil(DASHBOARD_RANGE_DAYS * 0.75) ? "success" : "default",
    },
    {
      label: "Review backlog ratio",
      value:
        reviewBacklogRatio !== null
          ? `${reviewBacklogRatio.toFixed(2)}x`
          : reviewTasksMetric > 0
            ? "∞"
            : "0.00x",
      tone:
        reviewBacklogRatio !== null
          ? reviewBacklogRatio > 1
            ? "warning"
            : "success"
          : reviewTasksMetric > 0
            ? "warning"
            : "success",
    },
  ];

  const gatewayRows: SummaryRow[] = [
    { label: "Gateway status", value: gatewayStatusLabel, tone: gatewayStatusTone },
    { label: "Configured gateways", value: formatCount(gatewayTargets.length) },
    {
      label: "Connected gateways",
      value: formatCount(gatewayConnectedCount),
      tone: gatewayConnectedCount > 0 ? "success" : "default",
    },
    {
      label: "Unavailable gateways",
      value: formatCount(gatewayUnavailableCount),
      tone: gatewayUnavailableCount > 0 ? "danger" : "default",
    },
    {
      label: "Gateways with issues",
      value: formatCount(gatewayHealthErrorCount + gatewayDisconnectedCount),
      tone: gatewayHealthErrorCount + gatewayDisconnectedCount > 0 ? "warning" : "success",
    },
  ];
  const pendingApprovalItems = metrics?.pending_approvals.items ?? [];
  const pendingApprovalsTotal = metrics?.pending_approvals.total ?? 0;
  const hasPendingApprovals = pendingApprovalItems.length > 0;
  const activityFeedHref = "/activity";

  const shouldIgnoreRowNavigation = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest('a, button, input, select, textarea, [role="button"]'),
    );
  };

  const buildActivityEventHref = (event: ActivityEventRead): string => {
    const routeName = event.route_name ?? null;
    const routeParams = event.route_params ?? {};

    if (routeName === "board.approvals") {
      const boardId = routeParams.boardId;
      if (boardId) {
        return `/boards/${encodeURIComponent(boardId)}/approvals`;
      }
    }

    if (routeName === "board") {
      const boardId = routeParams.boardId;
      if (boardId) {
        const params = new URLSearchParams();
        Object.entries(routeParams).forEach(([key, value]) => {
          if (key !== "boardId") params.set(key, value);
        });
        const query = params.toString();
        return query
          ? `/boards/${encodeURIComponent(boardId)}?${query}`
          : `/boards/${encodeURIComponent(boardId)}`;
      }
    }

    const params = new URLSearchParams(
      Object.keys(routeParams).length > 0
        ? routeParams
        : {
            eventId: event.id,
            eventType: event.event_type,
            createdAt: event.created_at,
          },
    );
    if (event.task_id && !params.has("taskId")) {
      params.set("taskId", event.task_id);
    }
    return `${activityFeedHref}?${params.toString()}`;
  };

  const navigateToActivityFeed = (href: string) => {
    router.push(href);
  };

  const handleLogRowClick = (
    event: MouseEvent<HTMLDivElement>,
    href: string,
  ) => {
    if (shouldIgnoreRowNavigation(event.target)) return;
    navigateToActivityFeed(href);
  };

  const handleLogRowKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    href: string,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (shouldIgnoreRowNavigation(event.target)) return;
    event.preventDefault();
    navigateToActivityFeed(href);
  };

  const handleInspectSession = useCallback(async (session: SessionSummary) => {
    setSessionActionMessage(null);
    try {
      const response = await getGatewaySessionApiV1GatewaysSessionsSessionIdGet(session.sessionId, {
        board_id: session.boardId,
      });
      if (response.status !== 200) {
        setInspectedSession(null);
        setSessionActionMessage(`Inspect failed (${response.status}).`);
        return;
      }
      setInspectedSession(
        buildSessionInspectDetails(response.data.session, session.title, session.sessionId),
      );
      setSessionActionMessage(`Inspected ${session.title}.`);
    } catch (error) {
      setInspectedSession(null);
      setSessionActionMessage(
        error instanceof Error ? `Inspect failed: ${error.message}` : "Inspect failed.",
      );
    }
  }, []);

  const closeSessionInspect = useCallback(() => {
    setInspectedSession(null);
    setSessionActionMessage(null);
  }, []);

  const handleSessionsKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      if (!isPageActive || sessionSummaries.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSessionIndex((currentIndex) =>
          currentIndex < 0 ? 0 : Math.min(currentIndex + 1, sessionSummaries.length - 1),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSessionIndex((currentIndex) =>
          currentIndex < 0 ? sessionSummaries.length - 1 : Math.max(currentIndex - 1, 0),
        );
        return;
      }

      if (event.key === "Enter") {
        const activeSession = sessionSummaries[activeSessionIndex];
        if (!activeSession) return;
        event.preventDefault();
        void handleInspectSession(activeSession);
        return;
      }

      if (event.key === "Escape") {
        if (!inspectedSession && !killSessionTarget) return;
        event.preventDefault();
        closeSessionInspect();
        if (!isKillingSession) {
          setKillSessionError(null);
          setKillSessionTarget(null);
        }
      }
    },
    [
      activeSessionIndex,
      closeSessionInspect,
      handleInspectSession,
      inspectedSession,
      isKillingSession,
      isPageActive,
      killSessionTarget,
      sessionSummaries,
    ],
  );

  const handleKillSession = async () => {
    if (!killSessionTarget) return;
    setSessionActionMessage(null);
    setInspectedSession(null);
    setKillSessionError(null);
    setIsKillingSession(true);
    try {
      const params = new URLSearchParams();
      if (killSessionTarget.boardId) params.set("board_id", killSessionTarget.boardId);
      const query = params.toString();
      await customFetch<{ data: unknown; status: number; headers: Headers }>(
        `/api/v1/gateways/sessions/${encodeURIComponent(killSessionTarget.sessionId)}${
          query ? `?${query}` : ""
        }`,
        { method: "DELETE" },
      );
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "gateway-statuses"] });
      setSessionActionMessage(`Killed ${killSessionTarget.title}.`);
      setKillSessionTarget(null);
    } catch (error) {
      setKillSessionError(
        error instanceof Error ? `Kill failed: ${error.message}` : "Kill failed.",
      );
    } finally {
      setIsKillingSession(false);
    }
  };

  return (
    <DashboardShell>
      <SignedOut>
        <SignedOutPanel
          message="Sign in to access the dashboard."
          forceRedirectUrl="/onboarding"
          signUpForceRedirectUrl="/onboarding"
        />
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-4 md:p-8">
            <SeasonalBanner />
            {metricsQuery.error ? (
              <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
                Load failed: {metricsQuery.error.message}
              </div>
            ) : null}

            <div className="mb-3 flex items-center justify-end gap-3">
              <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                <span>{`Updated ${lastUpdatedLabel}`}</span>
                <button
                  type="button"
                  onClick={() => void metricsQuery.refetch()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                  aria-label="Refresh dashboard metrics"
                  title="Refresh dashboard metrics"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                  metricsStatus.className,
                )}
              >
                <span
                  className={metricsStatus.dotClassName}
                  style={metricsStatus.dotStyle}
                >
                  {metricsStatus.dot}
                </span>
                {metricsStatus.label}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TopMetricCard
                title="Online Agents"
                value={formatCount(activeAgentsMetric)}
                secondary={`${formatCount(agents.length)} total`}
                icon={<Bot className="h-4 w-4" />}
                accent="blue"
              />
              <TopMetricCard
                title="Tasks In Progress"
                value={formatCount(tasksInProgressMetric)}
                secondary={`${formatCount(tasksTotal)} total`}
                icon={<LayoutGrid className="h-4 w-4" />}
                accent="green"
              />
              <TopMetricCard
                title="Error Rate"
                value={formatPercent(errorRateMetric)}
                secondary={`${formatCount(Number(latestThroughputPoint?.value ?? 0))} completed (latest)`}
                icon={<Activity className="h-4 w-4" />}
                accent="violet"
              />
              <TopMetricCard
                title="Completion Speed"
                value={formatPerDay(throughputTotal, DASHBOARD_RANGE_DAYS)}
                secondary={`${formatCount(throughputTotal)} completed`}
                infoText={`Based on ${DASHBOARD_RANGE_LABEL}`}
                icon={<Timer className="h-4 w-4" />}
                accent="emerald"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <InfoBlock
                title="Workload"
                rows={workloadRows}
              />
              <InfoBlock
                title="Throughput"
                infoText={`All throughput values are calculated for ${DASHBOARD_RANGE_LABEL}`}
                rows={throughputRows}
              />
              <InfoBlock
                title="Gateway Health"
                badge={{
                  text: gatewayStatusLabel,
                  tone: gatewayBadgeTone,
                }}
                rows={gatewayRows}
              />
            </div>

            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900">Pending Approvals</h3>
                <Link
                  href="/approvals"
                  className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-700"
                >
                  Open global approvals
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {!metrics && metricsQuery.isLoading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  Loading pending approvals...
                </div>
              ) : !metrics && metricsQuery.error ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  Pending approvals are temporarily unavailable.
                </div>
              ) : hasPendingApprovals ? (
                <div className="space-y-2">
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {pendingApprovalItems.map((item) => (
                      <Link
                        key={item.approval_id}
                        href={`/boards/${item.board_id}/approvals`}
                        className="flex items-center justify-between gap-3 px-3 py-2 transition hover:bg-slate-50"
                      >
                        <span className="min-w-0 text-sm text-slate-700">
                          <span className="block truncate font-medium text-slate-800">
                            {item.task_title || "Pending approval"}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="truncate">
                              {item.board_name} · {item.confidence}% score
                            </span>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 font-semibold",
                                pendingSinceBadgeClass(item.created_at),
                              )}
                            >
                              Pending since {formatRelativeTimestamp(item.created_at)}
                            </span>
                          </span>
                        </span>
                        <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">
                          {formatRelativeTimestamp(item.created_at)}
                        </span>
                      </Link>
                    ))}
                  </div>
                  {pendingApprovalsTotal > pendingApprovalItems.length ? (
                    <p className="text-xs text-slate-500">
                      Showing latest {formatCount(pendingApprovalItems.length)} of{" "}
                      {formatCount(pendingApprovalsTotal)} pending approvals.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  No pending approvals across your boards.
                </div>
              )}
            </section>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-900">Sessions</h3>
                  <span aria-live="polite" className="text-xs text-slate-500">
                    {formatCount(activeSessions)}
                  </span>
                </div>
                {sessionActionMessage ? (
                  <div className="mb-2 max-w-[90vw] overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <p>{sessionActionMessage}</p>
                    {inspectedSession ? (
                      <div className="mt-2 min-w-0 max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white p-3 text-[11px] text-slate-700">
                        <p className="flex flex-wrap items-center gap-1 font-semibold text-slate-900">
                          <span>Session payload:</span>
                          <span
                            className={cn(
                              "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                              providerBadgeClass(inspectedSession.provider),
                            )}
                          >
                            {providerLabel(inspectedSession.provider)}
                          </span>
                          <span className="text-slate-400">/</span>
                          <span>{modelLabel(inspectedSession.model) ?? DASH}</span>
                          <span className="text-slate-400">·</span>
                          <CopyableId
                            value={inspectedSession.sessionId}
                            copyLabel="Copy session ID"
                          />
                        </p>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Model
                            </p>
                            <p>{inspectedSession.model ?? DASH}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Context usage
                            </p>
                            <p>{inspectedSession.usage}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Active tools
                            </p>
                            <p>
                              {inspectedSession.activeToolCount !== null
                                ? formatCount(inspectedSession.activeToolCount)
                                : DASH}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Session config
                          </p>
                          <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-slate-950/95 p-2 font-mono text-[10px] leading-4 text-slate-100 break-all">
                            {inspectedSession.sessionConfig ?? DASH}
                          </pre>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <ul
                  role="listbox"
                  tabIndex={0}
                  aria-label="Sessions"
                  aria-activedescendant={
                    activeSessionIndex >= 0 && sessionSummaries[activeSessionIndex]
                      ? sessionOptionId(sessionSummaries[activeSessionIndex].key)
                      : undefined
                  }
                  onKeyDown={handleSessionsKeyDown}
                  className="min-h-[220px] max-h-[310px] list-none space-y-2 overflow-x-hidden overflow-y-auto pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  {!hasConfiguredGateways ? (
                    <li
                      role="presentation"
                      className="flex min-h-[76px] items-center rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500"
                    >
                      No gateways are configured for any board yet.
                    </li>
                  ) : gatewayStatusesQuery.isLoading ? (
                    <li role="presentation">
                      <DashboardPanelSkeleton />
                    </li>
                  ) : sessionSummaries.length > 0 ? (
                    <>
                      {gatewayUnavailableCount > 0 ? (
                        <li
                          role="presentation"
                          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
                        >
                          {formatCount(gatewayUnavailableCount)} gateway
                          {gatewayUnavailableCount === 1 ? "" : "s"} unavailable; showing sessions
                          from reachable gateways.
                        </li>
                      ) : null}
                      {sessionSummaries.map((session, index) => (
                        <li
                          key={session.key}
                          id={sessionOptionId(session.key)}
                          role="option"
                          aria-selected={index === activeSessionIndex}
                          className={cn(
                            "min-h-[76px] overflow-hidden rounded-lg border bg-white px-3 py-2",
                            index === activeSessionIndex
                              ? "border-slate-400 ring-2 ring-slate-200"
                              : "border-slate-200",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-900">
                                <span
                                  className={cn(
                                    "mr-2 inline-block h-2.5 w-2.5 rounded-full",
                                    sessionHealthDotClass[session.health],
                                  )}
                                  title={session.health}
                                />
                                {session.title}
                              </p>
                              <div className="mt-1 flex min-w-0 items-center gap-2">
                                <span
                                  className={cn(
                                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                                    providerBadgeClass(session.provider),
                                  )}
                                  title={session.model ?? providerLabel(session.provider)}
                                >
                                  {providerLabel(session.provider)}
                                  {session.model ? ` · ${modelLabel(session.model)}` : ""}
                                </span>
                                <div className="flex min-w-0 items-center gap-1 text-xs text-slate-500">
                                  {normalizeBoardId(session.boardId) ? (
                                    <Link
                                      href={`/boards/${encodeURIComponent(
                                        normalizeBoardId(session.boardId) ?? "",
                                      )}`}
                                      className="truncate text-slate-600 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-900"
                                      title={
                                        session.boardName ??
                                        normalizeBoardId(session.boardId) ??
                                        "Board unavailable"
                                      }
                                    >
                                      {session.boardName ?? normalizeBoardId(session.boardId)}
                                    </Link>
                                  ) : (
                                    <span className="truncate" title="Board unavailable">
                                      {DASH}
                                    </span>
                                  )}
                                  <span className="shrink-0">·</span>
                                  <span className="truncate" title={session.subtitle}>
                                    {session.subtitle}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="min-w-0 max-w-[36%] text-right">
                              <div
                                className="group ml-auto w-full max-w-36"
                                title={
                                  session.usageLabel === DASH
                                    ? "Usage unavailable"
                                    : session.usageLabel
                                }
                                aria-label={
                                  session.usageLabel === DASH
                                    ? "Usage unavailable"
                                    : `Context window usage ${session.usageLabel}`
                                }
                              >
                                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-[width]",
                                      session.usageToneClassName,
                                    )}
                                    style={{ width: `${session.usagePercent ?? 0}%` }}
                                  />
                                </div>
                                <div className="relative mt-1 h-4 text-[11px]">
                                  <p className="absolute inset-0 truncate text-slate-500 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
                                    {session.lastSeenAt
                                      ? formatRelativeTimestamp(session.lastSeenAt)
                                      : "Activity unavailable"}
                                  </p>
                                  <p className="absolute inset-0 truncate font-medium text-slate-700 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                    {session.usageLabel === DASH
                                      ? "Usage unavailable"
                                      : session.usageLabel}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                                aria-label={`Inspect ${session.title}`}
                                title="Inspect"
                                onClick={() => void handleInspectSession(session)}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                                aria-label={`Kill ${session.title}`}
                                title="Kill"
                                onClick={() => {
                                  setKillSessionError(null);
                                  setKillSessionTarget(session);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </>
                  ) : gatewayUnavailableCount === gatewayTargets.length ? (
                    <li
                      role="presentation"
                      className="flex min-h-[76px] items-center rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700"
                    >
                      Session data is unavailable for all configured gateways.
                    </li>
                  ) : (
                    <li
                      role="presentation"
                      className="flex min-h-[76px] items-center rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500"
                    >
                      No active sessions detected.
                    </li>
                  )}
                </ul>
              </section>

              <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
                  <Link
                    href={activityFeedHref}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-700"
                  >
                    Open feed
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="max-h-[310px] space-y-2 overflow-x-hidden overflow-y-auto pr-1">
                  {activityQuery.isLoading && recentLogs.length === 0 ? (
                    <DashboardPanelSkeleton />
                  ) : recentLogs.length > 0 ? (
                    recentLogs.map((event) => {
                      const eventHref = buildActivityEventHref(event);
                      return (
                        <div
                          key={event.id}
                          role="link"
                          tabIndex={0}
                        aria-label={`Open related context for ${event.event_type} activity`}
                          onClick={(interactionEvent) =>
                            handleLogRowClick(interactionEvent, eventHref)
                          }
                          onKeyDown={(interactionEvent) =>
                            handleLogRowKeyDown(interactionEvent, eventHref)
                          }
                          className="cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2 transition hover:border-slate-300 focus-visible:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="break-words text-sm font-medium text-slate-900 [&_ol]:mb-0 [&_p]:mb-0 [&_pre]:my-1 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_ul]:mb-0">
                                <Markdown
                                  content={event.message?.trim() || event.event_type}
                                  variant="comment"
                                />
                              </div>
                              <p className="mt-0.5 text-xs uppercase tracking-wider text-slate-500">
                                {event.event_type}
                              </p>
                            </div>
                            <div className="shrink-0 text-right text-[11px] text-slate-500">
                              <p>{formatRelativeTimestamp(event.created_at)}</p>
                              <p>{formatTimestamp(event.created_at)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex h-[240px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-500">
                      <Shield className="mb-2 h-5 w-5 text-slate-400" />
                      No activity yet
                      <p className="mt-1 text-xs text-slate-500">Activity appears here when events are emitted.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
            <ConfirmActionDialog
              open={Boolean(killSessionTarget)}
              onOpenChange={(open) => {
                if (!open && !isKillingSession) {
                  setKillSessionError(null);
                  setKillSessionTarget(null);
                }
              }}
              ariaLabel="Kill session"
              title="Kill session"
              description={
                <>
                  <strong>{killSessionTarget?.title}</strong>
                  <br />
                  This will terminate the agent session. Continue?
                </>
              }
              errorMessage={killSessionError}
              onConfirm={() => void handleKillSession()}
              isConfirming={isKillingSession}
              confirmLabel="Kill"
              confirmingLabel="Killing…"
              confirmVariant="destructive"
              cancelLabel="Cancel"
              cancelVariant="secondary"
            />
          </div>
        </main>
      </SignedIn>
    </DashboardShell>
  );
}
